-- All browser access passes through the Edge Function's current team-role check.
-- No bridge credential or QR is readable through the public Data API.
create table public.wa_linked_status (
 id text primary key check(id='primary'), worker_id uuid not null,
 state text not null, qr_data_url text, updated_at timestamptz not null default now()
);
create table public.wa_linked_events (
 event_key text primary key, payload jsonb not null,
 received_at timestamptz not null default now()
);
create table public.wa_linked_sends (
 id uuid primary key, created_by uuid not null references auth.users(id),
 to_phone text not null check(to_phone ~ '^\+[1-9][0-9]{7,14}$'),
 body text not null check(length(trim(body)) between 1 and 4096),
 state text not null default 'queued' check(state in ('queued','processing','submitted','unconfirmed','not_registered','cancelled')),
 worker_id uuid, provider_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index wa_linked_sends_pending on public.wa_linked_sends(state,created_at) where state in ('queued','processing');
create index wa_linked_events_received on public.wa_linked_events(received_at desc);
alter table public.wa_linked_status enable row level security;
alter table public.wa_linked_events enable row level security;
alter table public.wa_linked_sends enable row level security;
revoke all on public.wa_linked_status,public.wa_linked_events,public.wa_linked_sends from public,anon,authenticated;
grant select,insert,update,delete on public.wa_linked_status,public.wa_linked_events,public.wa_linked_sends to service_role;
-- A processing command is retried only by the SAME durable worker identity.
-- That worker's SQLite send journal prevents duplicate provider submissions.
create function public.service_claim_wa_linked_send(p_worker_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare command public.wa_linked_sends;
begin
 select * into command from public.wa_linked_sends
 where (state='processing' and worker_id=p_worker_id) or state='queued'
 order by case when state='processing' then 0 else 1 end,created_at
 limit 1 for update skip locked;
 if not found then return null; end if;
 update public.wa_linked_sends set state='processing',worker_id=p_worker_id,updated_at=now() where id=command.id;
 return jsonb_build_object('request_id',command.id,'to',command.to_phone,'body',command.body);
end $$;
revoke all on function public.service_claim_wa_linked_send(uuid) from public,anon,authenticated;
grant execute on function public.service_claim_wa_linked_send(uuid) to service_role;
