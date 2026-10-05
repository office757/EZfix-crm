-- Keep the physical assignment status and the legacy display metadata consistent.
create or replace function private.sync_owner_job_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_owner() or new.technician_id is not distinct from old.technician_id then return new;end if;
 update public.lead_offers o set status='cancelled',responded_at=now()
 where o.status='pending' and exists(select 1 from public.leads l where l.id=o.lead_id and l.converted_job_id=new.id);
 update public.leads set assigned_technician_id=new.technician_id,
  assignment_status=case when new.technician_id is null then 'unassigned' else 'assigned' end,
  app_data=coalesce(app_data,'{}')||jsonb_build_object('assigned_technician',new.technician,'assignment_status',case when new.technician_id is null then 'unassigned' else 'assigned' end)
 where converted_job_id=new.id and deleted_at is null;
 return new;
end;$$;
revoke all on function private.sync_owner_job_assignment() from public,anon,authenticated;
