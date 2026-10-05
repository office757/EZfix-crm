alter table public.team add column if not exists profile_photo_path text;
create policy technician_portrait_insert on storage.objects as restrictive for insert to authenticated with check (name not like 'team-profiles/%' or (bucket_id='crm-assets' and (select public.is_office())));
create policy technician_portrait_read on storage.objects as restrictive for select to authenticated using (name not like 'team-profiles/%' or (bucket_id='crm-assets' and ((select public.is_office()) or split_part(name,'/',2)=(select public.current_team_id()))));
create policy technician_portrait_update on storage.objects as restrictive for update to authenticated using (name not like 'team-profiles/%') with check (name not like 'team-profiles/%');
create or replace function private.set_technician_profile_photo(p_team_id text,p_path text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_office() then raise exception 'Office access required';end if;
 if not exists(select 1 from public.team where id=p_team_id and role='technician') then raise exception 'Technician not found';end if;
 if p_path is not null and (p_path not like 'team-profiles/'||p_team_id||'/%' or p_path !~ '^team-profiles/[a-zA-Z0-9_-]+/[a-f0-9-]+\.jpg$' or not exists(select 1 from storage.objects where bucket_id='crm-assets' and name=p_path and owner_id=auth.uid()::text and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 2097152)) then raise exception 'Upload a valid technician portrait first';end if;
 update public.team set profile_photo_path=p_path,updated_at=now() where id=p_team_id;
 insert into public.audit_log(action,summary,entity_type,entity_id,source,priority,created_by_team_id) values('technician_profile_photo',case when p_path is null then 'Technician profile photo removed' else 'Technician profile photo updated' end,'team',p_team_id,'app_client','normal',public.current_team_id());
end;$$;
revoke all on function private.set_technician_profile_photo(text,text) from public,anon;
grant execute on function private.set_technician_profile_photo(text,text) to authenticated;
create or replace function public.set_technician_profile_photo(p_team_id text,p_path text) returns void language sql security invoker set search_path='' as $$select private.set_technician_profile_photo(p_team_id,p_path)$$;
revoke all on function public.set_technician_profile_photo(text,text) from public,anon;
grant execute on function public.set_technician_profile_photo(text,text) to authenticated;
