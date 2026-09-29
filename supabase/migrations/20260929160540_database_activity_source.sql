-- Keep all existing source values and add the server-owned record-change source.
alter table public.audit_log drop constraint audit_log_source_check;
alter table public.audit_log add constraint audit_log_source_check check(source in ('app_client','system','provider','security','migration','payment','manual','database'));
