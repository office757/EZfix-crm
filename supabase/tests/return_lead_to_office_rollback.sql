-- Run against an assigned, not-yet-started dispatch job. All writes roll back.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team where role='owner' and status='active' and auth_user_id is not null limit 1),true);
set local role authenticated;
do $$
declare l public.leads%rowtype;j public.jobs%rowtype;owner_uid text:=auth.uid()::text;tech_uid text;r jsonb;
begin
 select leads.* into l from public.leads leads join public.jobs jobs on jobs.id=leads.converted_job_id where leads.assigned_technician_id is not null and jobs.technician_id=leads.assigned_technician_id and jobs.workflow_version=1 and jobs.status='technician_assigned' and leads.deleted_at is null and jobs.deleted_at is null and not exists(select 1 from public.job_evidence where job_id=jobs.id) limit 1;
 if not found then raise exception 'Test requires an assigned dispatch fixture';end if;
 select * into j from public.jobs where id=l.converted_job_id;
 select auth_user_id::text into tech_uid from public.team where id=l.assigned_technician_id;
 perform set_config('request.jwt.claim.sub',tech_uid,true);
 begin
  perform public.return_lead_to_office(l.id,l.assigned_technician_id);
  raise exception 'TEST: technician was permitted';
 exception when others then if sqlerrm<>'Office access required' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',owner_uid,true);
 begin
  perform public.return_lead_to_office(l.id,'stale-technician');
  raise exception 'TEST: stale assignment was permitted';
 exception when others then if sqlerrm<>'Assignment changed. Refresh the lead before trying again' then raise;end if;end;
 r:=public.return_lead_to_office(l.id,l.assigned_technician_id);
 if r->>'status'<>'unassigned' then raise exception 'TEST: wrong result';end if;
 if exists(select 1 from public.leads where id=l.id and assigned_technician_id is not null) or exists(select 1 from public.jobs where id=j.id and technician_id is not null) then raise exception 'TEST: assignment remained';end if;
 if exists(select 1 from public.jobs where id=j.id and (scheduled_date is distinct from j.scheduled_date or appointment_window is distinct from j.appointment_window)) then raise exception 'TEST: appointment changed';end if;
 if exists(select 1 from public.lead_offers where lead_id=l.id and status in ('pending','accepted')) then raise exception 'TEST: old offer remained actionable';end if;
 if not exists(select 1 from public.audit_log where entity_id=j.id and action='technician_unassigned') then raise exception 'TEST: missing audit';end if;
 begin
  perform public.return_lead_to_office(l.id,l.assigned_technician_id);
  raise exception 'TEST: duplicate release was permitted';
 exception when others then if sqlerrm<>'Assignment changed. Refresh the lead before trying again' then raise;end if;end;
end;$$;
rollback;
