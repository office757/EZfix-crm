-- Office-only release, serialized with acceptance/reassignment on lead then job.
grant crm_workflow_executor to postgres;
grant create on schema private to crm_workflow_executor;
create function private.return_lead_to_office(p_lead_id text,p_expected_technician_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.leads%rowtype;j public.jobs%rowtype;next_status text;
begin
 if auth.uid() is null or public.is_office() is not true then raise exception 'Office access required';end if;
 select * into l from public.leads where id=p_lead_id and deleted_at is null for update;
 if not found or l.converted_job_id is null or l.status in ('lost','cancelled') then raise exception 'Active dispatch lead required';end if;
 select * into j from public.jobs where id=l.converted_job_id and deleted_at is null for update;
 if not found or j.workflow_version<>1 then raise exception 'Dispatch job required';end if;
 if p_expected_technician_id is null or j.technician_id is distinct from p_expected_technician_id or l.assigned_technician_id is distinct from p_expected_technician_id then raise exception 'Assignment changed. Refresh the lead before trying again';end if;
 if j.status not in ('new','scheduled','confirmed','technician_assigned','on_the_way') then raise exception 'Return to office is available only before arrival';end if;
 if exists(select 1 from public.job_evidence where job_id=j.id) then raise exception 'Arrival or work evidence exists. Review the job before reassignment';end if;
 next_status:=case when j.scheduled_date is null then 'new' else 'scheduled' end;
 update public.lead_offers set status='cancelled' where lead_id=l.id and status in ('pending','accepted');
 update public.jobs set technician_id=null,technician='',status=next_status,status_history=coalesce(status_history,'[]')||jsonb_build_array(jsonb_build_object('status',next_status,'at',floor(extract(epoch from clock_timestamp())*1000),'reason','Returned to office; awaiting technician','previousTechnicianId',p_expected_technician_id)) where id=j.id;
 update public.leads set assigned_technician_id=null,assignment_status='unassigned',app_data=coalesce(app_data,'{}')||jsonb_build_object('assigned_technician','') where id=l.id;
 insert into public.audit_log(id,action,summary,entity_type,entity_id,source,read)
 values(gen_random_uuid()::text,'technician_unassigned','Returned to office by '||public.current_team_id()||'; previous technician '||p_expected_technician_id,'jobs',j.id,'system',false);
 return jsonb_build_object('lead_id',l.id,'job_id',j.id,'status','unassigned');
end;$$;
alter function private.return_lead_to_office(text,text) owner to crm_workflow_executor;
create function public.return_lead_to_office(p_lead_id text,p_expected_technician_id text) returns jsonb
language sql security invoker set search_path='' as $$select private.return_lead_to_office(p_lead_id,p_expected_technician_id)$$;
revoke all on function private.return_lead_to_office(text,text),public.return_lead_to_office(text,text) from public,anon;
grant execute on function private.return_lead_to_office(text,text),public.return_lead_to_office(text,text) to authenticated;
revoke create on schema private from crm_workflow_executor;
revoke crm_workflow_executor from postgres;
