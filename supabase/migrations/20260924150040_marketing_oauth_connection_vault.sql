-- Server-only OAuth connection metadata + Vault helpers.
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
revoke all on table public.marketing_oauth_connections from public, anon, authenticated;
grant select,insert,update,delete on table public.marketing_oauth_connections to service_role;

create or replace function public.store_marketing_oauth_secret(p_name text, p_secret text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if nullif(btrim(coalesce(p_name,'')),'') is null or nullif(coalesce(p_secret,''),'') is null then raise exception 'secret name and value required'; end if;
  select id into v_id from vault.decrypted_secrets where name=p_name limit 1;
  if v_id is null then
    v_id := vault.create_secret(p_secret,p_name,'EZfix marketing OAuth credential',null::uuid);
  else
    perform vault.update_secret(v_id,p_secret,p_name,'EZfix marketing OAuth credential',null::uuid);
  end if;
  return v_id::text;
end $$;
revoke execute on function public.store_marketing_oauth_secret(text,text) from public, anon, authenticated;
grant execute on function public.store_marketing_oauth_secret(text,text) to service_role;

create or replace function public.get_marketing_oauth_secret(p_ref text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where id=p_ref::uuid limit 1;
  return v_secret;
end $$;
revoke execute on function public.get_marketing_oauth_secret(text) from public, anon, authenticated;
grant execute on function public.get_marketing_oauth_secret(text) to service_role;
