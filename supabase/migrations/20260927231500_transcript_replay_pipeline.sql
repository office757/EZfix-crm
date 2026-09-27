-- AI transcript replay is synthetic audio, never an original recording.
alter table public.calls add column if not exists transcript_replay_asset jsonb;
alter table public.calls add column if not exists transcript_replay_status text;
alter table public.calls add column if not exists transcript_replay_source_hash text;
alter table public.calls add column if not exists transcript_replay_error text;
alter table public.calls add column if not exists transcript_replay_updated_at timestamptz;
alter table public.calls add column if not exists transcript_replay_generation bigint not null default 0;

create or replace function public.enqueue_call_transcript_replay()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  has_transcript boolean := jsonb_typeof(coalesce(new.transcript,'[]'::jsonb))='array'
    and jsonb_array_length(coalesce(new.transcript,'[]'::jsonb))>0;
  became_complete boolean := lower(coalesce(new.status,''))='completed'
    and (tg_op='INSERT' or lower(coalesce(old.status,''))<>'completed');
  transcript_changed boolean := tg_op='INSERT' or new.transcript is distinct from old.transcript;
begin
  if lower(coalesce(new.status,''))='completed' and has_transcript and (became_complete or transcript_changed) then
    new.transcript_replay_generation := coalesce(case when tg_op='UPDATE' then old.transcript_replay_generation else 0 end,0)+1;
    new.transcript_replay_status := 'pending';
    new.transcript_replay_error := null;
    new.transcript_replay_updated_at := now();
  elsif not has_transcript then
    new.transcript_replay_status := null;
    new.transcript_replay_error := null;
  end if;
  return new;
end;
$$;

drop trigger if exists calls_enqueue_transcript_replay on public.calls;
create trigger calls_enqueue_transcript_replay
before insert or update of transcript,status on public.calls
for each row execute function public.enqueue_call_transcript_replay();

update public.calls
set transcript_replay_status='pending',
    transcript_replay_generation=case when transcript_replay_generation<1 then 1 else transcript_replay_generation end,
    transcript_replay_error=null,
    transcript_replay_updated_at=now()
where lower(coalesce(status,''))='completed'
  and jsonb_typeof(coalesce(transcript,'[]'::jsonb))='array'
  and jsonb_array_length(coalesce(transcript,'[]'::jsonb))>0
  and transcript_replay_asset is null
  and coalesce(transcript_replay_status,'') not in ('pending','generating','ready');

drop policy if exists crm_assets_active_read on storage.objects;
create policy crm_assets_active_read
on storage.objects for select to authenticated
using (
  bucket_id='crm-assets'
  and public.current_team_id() is not null
  and (
    (name not like 'call-recordings/%' and name not like 'transcript-replays/%')
    or lower(coalesce(public.current_app_role(),'')) in ('owner','admin')
  )
);

drop policy if exists crm_assets_active_insert on storage.objects;
create policy crm_assets_active_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='crm-assets'
  and public.current_team_id() is not null
  and (
    (name not like 'call-recordings/%' and name not like 'transcript-replays/%')
    or lower(coalesce(public.current_app_role(),'')) in ('owner','admin')
  )
);

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='ezfix-transcript-replay-worker' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
end $$;

select cron.schedule(
  'ezfix-transcript-replay-worker',
  '*/3 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://fylbalenuqpovwncwbah.supabase.co/functions/v1/generate-transcript-replay',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-ezfix-cron-token',(
        select decrypted_secret from vault.decrypted_secrets
        where name='ezfix_call_sync_cron_token' limit 1
      )
    ),
    body := jsonb_build_object('source','supabase_cron','scheduled_at',now()),
    timeout_milliseconds := 120000
  );
  $cmd$
);