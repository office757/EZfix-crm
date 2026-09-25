-- Single-use authorization records for AI-assisted service callbacks.
create table if not exists public.voice_callback_authorizations (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('customers','leads')),
  entity_id text not null,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  purpose text not null default 'service_callback' check (purpose='service_callback'),
  consent_text text not null,
  consent_source text not null check (consent_source in ('customer_request','recorded_call','signed_form')),
  evidence_reference text not null,
  consented_at timestamptz not null,
  expires_at timestamptz not null,
  created_by_team_id text not null references public.team(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz null,
  used_at timestamptz null,
  provider_call_id text null,
  attempt_status text null,
  attempt_error text null,
  constraint voice_callback_expiry_valid check (
    expires_at > consented_at
    and expires_at <= consented_at + interval '30 days'
  )
);

alter table public.voice_callback_authorizations enable row level security;
revoke all on table public.voice_callback_authorizations from public, anon, authenticated;
grant select, insert, update on table public.voice_callback_authorizations to service_role;

create index if not exists voice_callback_authorizations_entity_idx
  on public.voice_callback_authorizations(entity_type,entity_id,created_at desc);

create unique index if not exists voice_callback_authorizations_one_active_idx
  on public.voice_callback_authorizations(entity_type,entity_id,phone_e164)
  where revoked_at is null and used_at is null;

-- No direct client RPC is exposed. The authenticated Edge Function below
-- performs owner authorization before using service_role.
