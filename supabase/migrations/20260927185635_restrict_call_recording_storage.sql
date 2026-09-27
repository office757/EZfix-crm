drop policy if exists crm_assets_active_read on storage.objects;
create policy crm_assets_active_read on storage.objects for select to authenticated
using (bucket_id='crm-assets' and public.current_team_id() is not null and (name not like 'call-recordings/%' or lower(coalesce(public.current_app_role(),'')) in ('owner','admin')));

drop policy if exists crm_assets_active_insert on storage.objects;
create policy crm_assets_active_insert on storage.objects for insert to authenticated
with check (bucket_id='crm-assets' and public.current_team_id() is not null and (name not like 'call-recordings/%' or lower(coalesce(public.current_app_role(),'')) in ('owner','admin')));