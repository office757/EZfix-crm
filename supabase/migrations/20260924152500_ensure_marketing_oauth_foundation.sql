-- Reproducible server-only OAuth foundation for Owner Marketing Office.
create schema if not exists private;
grant usage on schema private to service_role;

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
create index if not exists marketing_oauth_states_expires_idx on public.marketing_oauth_states(expires_at);
create index if not exists marketing_oauth_states_provider_created_idx on public.marketing_oauth_states(provider,created_at desc);
alter table public.marketing_oauth_states enable row level security;
alter table public.marketing_oauth_states force row level security;
revoke all on table public.marketing_oauth_states from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.marketing_oauth_states to service_role;

create table if not exists public.marketing_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider in ('google_ads','google_business_profile','meta')),
  status text not null default 'not_connected',
  credential_ref text,
  granted_scopes text[] not null default '{}'::text[],
  account_meta jsonb not null default '{}'::jsonb,
  token_expires_at timestamptz,
  connected_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.marketing_oauth_connections enable row level security;
alter table public.marketing_oauth_connections force row level security;
revoke all on table public.marketing_oauth_connections from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.marketing_oauth_connections to service_role;

create or replace function private.store_marketing_oauth_secret_internal(p_name text,p_secret text)
returns text language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if nullif(btrim(coalesce(p_name,'')),'') is null or nullif(coalesce(p_secret,''),'') is null then raise exception 'secret name and value required'; end if;
  select id into v_id from vault.decrypted_secrets where name=p_name limit 1;
  if v_id is null then
    v_id:=vault.create_secret(p_secret,p_name,'EZfix marketing OAuth credential',null::uuid);
  else
    perform vault.update_secret(v_id,p_secret,p_name,'EZfix marketing OAuth credential',null::uuid);
  end if;
  return v_id::text;
end $$;
revoke execute on function private.store_marketing_oauth_secret_internal(text,text) from public,anon,authenticated;
grant execute on function private.store_marketing_oauth_secret_internal(text,text) to service_role;

create or replace function private.get_marketing_oauth_secret_internal(p_ref text)
returns text language plpgsql security definer set search_path='' as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where id=p_ref::uuid limit 1;
  return v_secret;
end $$;
revoke execute on function private.get_marketing_oauth_secret_internal(text) from public,anon,authenticated;
grant execute on function private.get_marketing_oauth_secret_internal(text) to service_role;

create or replace function public.store_marketing_oauth_secret(p_name text,p_secret text)
returns text language sql security invoker set search_path=''
as $$ select private.store_marketing_oauth_secret_internal(p_name,p_secret) $$;
revoke execute on function public.store_marketing_oauth_secret(text,text) from public,anon,authenticated;
grant execute on function public.store_marketing_oauth_secret(text,text) to service_role;

create or replace function public.get_marketing_oauth_secret(p_ref text)
returns text language sql security invoker set search_path=''
as $$ select private.get_marketing_oauth_secret_internal(p_ref) $$;
revoke execute on function public.get_marketing_oauth_secret(text) from public,anon,authenticated;
grant execute on function public.get_marketing_oauth_secret(text) to service_role;
