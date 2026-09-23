-- Phase 2 hardening: remove writable schemas from SECURITY DEFINER lookup paths.
-- Function bodies already schema-qualify application tables, auth.uid(), and sequences.
-- Keep these functions SECURITY DEFINER where RLS recursion/privileged atomic operations require it.

alter function public.adjust_product_stock(text, text, numeric, text, text) set search_path = '';
alter function public.current_app_role() set search_path = '';
alter function public.current_team_id() set search_path = '';
alter function public.current_team_id_any_status() set search_path = '';
alter function public.log_audit_event(text, text, text, text, text, text, text) set search_path = '';
alter function public.next_estimate_number() set search_path = '';
alter function public.next_invoice_number() set search_path = '';
