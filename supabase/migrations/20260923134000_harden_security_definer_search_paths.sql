-- Harden SECURITY DEFINER functions by removing caller-controlled schemas
-- from name resolution. Function bodies already schema-qualify table/sequence
-- references and auth.uid() calls. Keep authorization semantics unchanged.

alter function public.adjust_product_stock(text, text, numeric, text, text)
  set search_path = '';
alter function public.current_app_role()
  set search_path = '';
alter function public.current_team_id()
  set search_path = '';
alter function public.current_team_id_any_status()
  set search_path = '';
alter function public.log_audit_event(text, text, text, text, text, text, text)
  set search_path = '';
alter function public.next_estimate_number()
  set search_path = '';
alter function public.next_invoice_number()
  set search_path = '';
