create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create or replace function private.select_google_ads_account_internal(p_connection_id uuid,p_customer_id text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_exists boolean;
begin
  if p_connection_id is null or p_customer_id !~ '^[0-9]{1,20}$' then raise exception 'Invalid Google Ads account selection'; end if;
  select exists(select 1 from public.google_ads_accounts where connection_id=p_connection_id and customer_id=p_customer_id) into v_exists;
  if not v_exists then raise exception 'Google Ads account was not discovered for this connection' using errcode='P0002'; end if;
  update public.google_ads_accounts set selected=(customer_id=p_customer_id),updated_at=now() where connection_id=p_connection_id;
  update public.google_ads_connections set selected_customer_id=p_customer_id,status='connected',updated_at=now() where id=p_connection_id;
  if not found then raise exception 'Google Ads connection not found' using errcode='P0002'; end if;
  update public.marketing_channels set connection_status='connected',updated_at=now() where id='google_ads';
  return jsonb_build_object('connection_id',p_connection_id,'customer_id',p_customer_id,'selected',true,'write_enabled',false);
end $$;

revoke execute on function private.select_google_ads_account_internal(uuid,text) from public,anon,authenticated;
grant execute on function private.select_google_ads_account_internal(uuid,text) to service_role;

create or replace function public.select_google_ads_account_server(p_connection_id uuid,p_customer_id text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.select_google_ads_account_internal(p_connection_id,p_customer_id) $$;
revoke execute on function public.select_google_ads_account_server(uuid,text) from public,anon,authenticated;
grant execute on function public.select_google_ads_account_server(uuid,text) to service_role;
