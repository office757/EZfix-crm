create or replace function private.set_technician_profile_photo(p_team_id text,p_path text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_office() then raise exception 'Office access required';end if;
 if not exists(select 1 from public.team where id=p_team_id and role='technician') then raise exception 'Technician not found';end if;
 if p_path is not null and (p_path not like 'team-profiles/'||p_team_id||'/%' or p_path !~ '^team-profiles/[a-zA-Z0-9_-]+/[a-f0-9-]+\.jpg$' or not exists(select 1 from storage.objects where bucket_id='crm-assets' and name=p_path and owner_id=auth.uid()::text and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 2097152)) then raise exception 'Upload a valid technician portrait first';end if;
 update public.team set profile_photo_path=p_path,updated_at=now() where id=p_team_id;
 insert into public.audit_log(id,action,summary,entity_type,entity_id,source,priority,created_by_team_id) values(gen_random_uuid()::text,'technician_profile_photo',case when p_path is null then 'Technician profile photo removed' else 'Technician profile photo updated' end,'team',p_team_id,'app_client','normal',public.current_team_id());
end;$$;
