-- Short-lived, server-only OAuth state for marketing integrations.
-- No browser role can read or write this table.
create table if not exists public.marketing_oauth_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google_ads','google_business_profile','meta')),
  state_hash text not null unique,
  code_verifier text not null,
  redirect_uri text not null,
  requested_scopes text[] not null default '{}'::text[],
  created_by_team_id text not null references public.team(id),
  return_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

alter table public.marketing_oauth_states enable row level security;
revoke all on table public.marketing_oauth_states from public, anon, authenticated;
grant select,insert,update,delete on table public.marketing_oauth_states to service_role;

create index if not exists marketing_oauth_states_expires_idx on public.marketing_oauth_states(expires_at);
create index if not exists marketing_oauth_states_provider_created_idx on public.marketing_oauth_states(provider, created_at desc);
