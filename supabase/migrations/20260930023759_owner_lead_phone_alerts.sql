-- Future leads only; device subscriptions require the owner's explicit browser permission.
create table public.owner_lead_push_queue (
 id uuid primary key default gen_random_uuid(),
 lead_id text not null references public.leads(id) on delete cascade,
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 team_id text not null references public.team(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sending','accepted','unconfirmed','failed','skipped','expired')),
 created_at timestamptz not null default now(),
 claimed_at timestamptz, completed_at timestamptz,
 unique(lead_id,subscription_id)
);
alter table public.owner_lead_push_queue enable row level security;
revoke all on public.owner_lead_push_queue from public,anon,authenticated;
grant all on public.owner_lead_push_queue to service_role;
create index owner_lead_push_pending_idx on public.owner_lead_push_queue(created_at) where status='pending';
create index owner_lead_push_subscription_idx on public.owner_lead_push_queue(subscription_id);
create index owner_lead_push_team_idx on public.owner_lead_push_queue(team_id);

-- Trigger-only capability; clients cannot call or write to this queue.
create function private.queue_owner_lead_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is not null or new.source='Demo' or new.app_data->'is_demo'='true'::jsonb then return new; end if;
 insert into public.owner_lead_push_queue(lead_id,subscription_id,team_id)
 select new.id,s.id,t.id from public.push_subscriptions s join public.team t on t.id=s.team_id
 where t.role='owner' and t.status='active' and t.auth_user_id is not null
 on conflict(lead_id,subscription_id) do nothing;
 return new;
end;$$;
revoke all on function private.queue_owner_lead_push() from public,anon,authenticated;
create trigger queue_owner_lead_push after insert on public.leads
 for each row execute function private.queue_owner_lead_push();

-- Atomically claim once. Unknown provider outcomes are never automatically resent.
create function public.service_claim_owner_lead_push() returns table(id uuid,lead_id text,subscription_id uuid,team_id text,subscription jsonb,expires_at timestamptz)
language plpgsql security invoker set search_path='' as $$
begin
 update public.owner_lead_push_queue q set status='unconfirmed',completed_at=now()
 where q.status='sending' and q.claimed_at<now()-interval '5 minutes';
 update public.owner_lead_push_queue q set status='expired',completed_at=now()
 where q.status='pending' and q.created_at<now()-interval '24 hours';
 update public.owner_lead_push_queue q set status='skipped',completed_at=now()
 where q.status='pending' and not exists(
  select 1 from public.team t join public.push_subscriptions s on s.team_id=t.id
  join public.leads l on l.id=q.lead_id
  where s.id=q.subscription_id and t.id=q.team_id and t.role='owner' and t.status='active' and t.auth_user_id is not null and l.deleted_at is null
 );
 return query with picked as (
  select q.id from public.owner_lead_push_queue q where q.status='pending'
  order by q.created_at,q.id for update skip locked limit 20
 ),claimed as (
  update public.owner_lead_push_queue q set status='sending',claimed_at=now()
  from picked p where q.id=p.id returning q.*
 ) select c.id,c.lead_id,c.subscription_id,c.team_id,s.subscription,c.created_at+interval '24 hours'
 from claimed c join public.push_subscriptions s on s.id=c.subscription_id and s.team_id=c.team_id;
end;$$;
revoke all on function public.service_claim_owner_lead_push() from public,anon,authenticated;
grant execute on function public.service_claim_owner_lead_push() to service_role;

select cron.schedule('ezfix-owner-lead-push','* * * * *',$cmd$
 select net.http_post(
  url := 'https://fylbalenuqpovwncwbah.supabase.co/functions/v1/owner-lead-push',
  headers := jsonb_build_object('Content-Type','application/json','x-ezfix-cron-token',
   (select decrypted_secret from vault.decrypted_secrets where name='ezfix_call_sync_cron_token' limit 1)),
  body := '{}'::jsonb,timeout_milliseconds := 55000
 ) where exists(select 1 from public.owner_lead_push_queue where status='pending' or (status='sending' and claimed_at<now()-interval '5 minutes'));
$cmd$);
