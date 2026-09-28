-- Service-only, atomic website appointment creation. Existing technician and
-- office guards stay intact; no browser role may execute this operation.
grant crm_workflow_executor to postgres;
grant create on schema private to crm_workflow_executor;
create function private.ensure_website_appointment(p_lead_id text) returns text
language plpgsql security definer set search_path='' as $$
declare l public.leads%rowtype; j public.jobs%rowtype; d date; t text; n integer;
begin
 select * into l from public.leads where id=p_lead_id and deleted_at is null for update;
 if not found or l.source<>'Website' or l.source_channel<>'Website Form' then raise exception 'Website lead required';end if;
 if l.converted_job_id is not null then return l.converted_job_id;end if;
 if l.status<>'new' or l.assigned_technician_id is not null or l.converted_customer_id is not null then raise exception 'Lead requires office review';end if;
 -- Recover a previously created website job instead of duplicating it.
 select count(*) into n from public.jobs where app_data->>'lead_id'=l.id and app_data->>'source'='website_form' and deleted_at is null;
 if n>1 then raise exception 'Multiple website appointments require office review';end if;
 if n=1 then
  select * into j from public.jobs where app_data->>'lead_id'=l.id and app_data->>'source'='website_form' and deleted_at is null for update;
  if j.technician_id is not null or j.customer_id is not null or j.workflow_version<>0 then raise exception 'Existing appointment requires office review';end if;
 else
  if coalesce(l.app_data->>'preferred_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Valid appointment date required';end if;
  d:=(l.app_data->>'preferred_date')::date;
  if extract(year from d)<2000 or extract(year from d)>extract(year from current_date)+5 then raise exception 'Appointment date outside supported range';end if;
  t:=left(trim(coalesce(l.app_data->>'preferred_time','')),100);
  if t='' then raise exception 'Appointment time required';end if;
  insert into public.jobs(id,customer_name,title,description,complaint,status,scheduled_date,appointment_window,app_data)
  values('job_web_'||gen_random_uuid(),l.name,coalesce(l.service_requested,'Website Service Request'),
   coalesce(l.notes,l.service_requested,'Website service request'),l.notes,'scheduled',d,
   case when coalesce((l.app_data->>'emergency')::boolean,false) then 'Emergency / ASAP' else t end,
   jsonb_build_object('source','website_form','lead_id',l.id,'address',l.address,'phone',l.phone,'email',l.email,
    'technician_assignment_required',true,'emergency',coalesce((l.app_data->>'emergency')::boolean,false))) returning * into j;
 end if;
 update public.leads set converted_job_id=j.id where id=l.id;
 return j.id;
end;$$;
alter function private.ensure_website_appointment(text) owner to crm_workflow_executor;
create function public.service_ensure_website_appointment(p_lead_id text) returns text
language sql security invoker set search_path='' as $$select private.ensure_website_appointment(p_lead_id)$$;
revoke all on function private.ensure_website_appointment(text),public.service_ensure_website_appointment(text) from public,anon,authenticated;
grant execute on function private.ensure_website_appointment(text),public.service_ensure_website_appointment(text) to service_role;
revoke create on schema private from crm_workflow_executor;
revoke crm_workflow_executor from postgres;
