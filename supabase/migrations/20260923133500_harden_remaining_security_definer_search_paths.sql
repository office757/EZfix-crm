-- Phase 2 hardening: remove writable schemas from SECURITY DEFINER lookup paths.
-- Before setting an empty search_path, qualify every helper function invoked by these
-- SECURITY DEFINER routines. Application tables, auth.uid(), and sequences are already
-- schema-qualified in the production definitions.

create or replace function public.log_audit_event(
  p_id text, p_action text, p_summary text, p_entity_type text default null, p_entity_id text default null,
  p_related_type text default null, p_related_id text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id text := public.current_team_id();
begin
  if v_team_id is null then
    raise exception 'log_audit_event: caller is not an active, linked team member';
  end if;
  insert into public.audit_log
    (id, action, summary, entity_type, entity_id, related_type, related_id, source, created_by_team_id)
  values
    (p_id, p_action, p_summary, p_entity_type, p_entity_id, p_related_type, p_related_id, 'app_client', v_team_id);
  return p_id;
end;
$$;

create or replace function public.next_estimate_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_num bigint;
begin
  if not public.is_owner() then
    raise exception 'next_estimate_number: only the owner may generate a new estimate number';
  end if;
  v_num := nextval('public.estimate_number_seq'::regclass);
  if v_num < 10000 then return 'EST' || lpad(v_num::text, 4, '0'); end if;
  return 'EST' || v_num::text;
end;
$$;

create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_num bigint;
begin
  if not public.is_owner() then
    raise exception 'next_invoice_number: only the owner may generate a new invoice number';
  end if;
  v_num := nextval('public.invoice_number_seq'::regclass);
  if v_num < 10000 then return 'INV' || lpad(v_num::text, 4, '0'); end if;
  return 'INV' || v_num::text;
end;
$$;

alter function public.adjust_product_stock(text, text, numeric, text, text) set search_path = '';
alter function public.current_app_role() set search_path = '';
alter function public.current_team_id() set search_path = '';
alter function public.current_team_id_any_status() set search_path = '';


-- current_team_id_any_status() is not called by the browser, RLS policies, triggers,
-- or other public helper functions in the verified production dependency graph.
-- Keep it available to privileged server/database roles but remove it from the Data API
-- surface for ordinary signed-in users.
revoke execute on function public.current_team_id_any_status() from authenticated;
