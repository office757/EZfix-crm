-- Preserve job history while making removal revoke access immediately.
create function public.remove_team_member(p_team_id text) returns text
language plpgsql security invoker set search_path='' as $$
declare member public.team%rowtype;
begin
 if auth.uid() is null or public.is_owner() is not true then raise exception 'Only the owner can remove users';end if;
 select * into member from public.team where id=p_team_id for update;
 if not found then raise exception 'User not found';end if;
 if member.role='owner' or member.auth_user_id=auth.uid() then raise exception 'Owner accounts cannot be removed here';end if;
 update public.team set status='inactive',app_data=coalesce(app_data,'{}')||jsonb_build_object('archivedAt',clock_timestamp(),'archivedBy',public.current_team_id()) where id=member.id;
 return member.id;
end;$$;
revoke all on function public.remove_team_member(text) from public,anon;
grant execute on function public.remove_team_member(text) to authenticated;

-- A job-form assignment uses the same private, expiring offer as dispatch.
-- Lock order matches acceptance (lead, then job); stale forms cannot replace a newer assignment.
grant crm_workflow_executor to postgres;
grant create on schema private to crm_workflow_executor;
grant insert on public.lead_offers to crm_workflow_executor;
create function private.offer_job_technician(p_job_id text,p_technician_id text,p_expected_technician_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.leads%rowtype;j public.jobs%rowtype;o public.lead_offers%rowtype;z text;
begin
 if auth.uid() is null or public.is_office() is not true then raise exception 'Office access required';end if;
 select * into l from public.leads where converted_job_id=p_job_id and deleted_at is null for update;
 if not found then raise exception 'Linked dispatch lead not found';end if;
 select * into j from public.jobs where id=p_job_id and deleted_at is null for update;
 if not found or j.workflow_version<>1 then raise exception 'Use the job form for this assignment';end if;
 if j.technician_id is distinct from p_expected_technician_id then raise exception 'Assignment changed. Refresh the job and try again';end if;
 if j.status not in ('new','scheduled','confirmed','technician_assigned','on_the_way') then raise exception 'Technicians can only be reassigned before arrival';end if;
 if p_technician_id is null or p_technician_id=j.technician_id then raise exception 'Choose a different technician';end if;
 if not exists(select 1 from public.team where id=p_technician_id and role='technician' and status='active' and auth_user_id is not null) then raise exception 'Select an active technician with Login Access';end if;
 z:=trim(coalesce(l.app_data->>'zip',''));
 if z !~ '^[0-9]{5}(-[0-9]{4})?$' then raise exception 'Add a valid ZIP code to the lead';end if;
 -- Retrying the same pending request does not send another offer.
 select * into o from public.lead_offers where lead_id=l.id and technician_id=p_technician_id and status='pending' and expires_at>clock_timestamp();
 if found then return to_jsonb(o);end if;
 update public.lead_offers set status='cancelled',responded_at=clock_timestamp() where lead_id=l.id and status='pending';
 update public.jobs set technician_id=null,technician='',status='new',status_history=coalesce(status_history,'[]')||jsonb_build_array(jsonb_build_object('status','new','at',floor(extract(epoch from clock_timestamp())*1000),'reason','Awaiting technician acceptance')) where id=j.id;
 update public.leads set assigned_technician_id=null,app_data=coalesce(app_data,'{}')||jsonb_build_object('assigned_technician',''),assignment_status='unassigned' where id=l.id;
 insert into public.lead_offers(lead_id,technician_id,zip,created_by) values(l.id,p_technician_id,z,public.current_team_id()) returning * into o;
 insert into public.audit_log(id,action,summary,entity_type,entity_id,recipient_technician_id,source,priority,read)
 values(gen_random_uuid()::text,'lead_offer','New lead · ZIP '||z||' · respond within 5 minutes','lead_offers',o.id::text,p_technician_id,'system','high',false);
 insert into public.audit_log(id,action,summary,entity_type,entity_id,source,read)
 values(gen_random_uuid()::text,'technician_offer','Technician offer sent; assignment awaits acceptance','jobs',j.id,'system',false);
 return to_jsonb(o);
end;$$;
alter function private.offer_job_technician(text,text,text) owner to crm_workflow_executor;
create function public.offer_job_technician(p_job_id text,p_technician_id text,p_expected_technician_id text)
returns jsonb language sql security invoker set search_path='' as $$select private.offer_job_technician(p_job_id,p_technician_id,p_expected_technician_id)$$;
revoke all on function private.offer_job_technician(text,text,text),public.offer_job_technician(text,text,text) from public,anon;
grant execute on function private.offer_job_technician(text,text,text),public.offer_job_technician(text,text,text) to authenticated;
revoke create on schema private from crm_workflow_executor;

-- New estimates belong to an already assigned job. Historical documents remain editable.
create function private.require_estimate_assignment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare j public.jobs%rowtype;
begin
 select * into j from public.jobs where id=new.converted_job_id and deleted_at is null for update;
 if not found or j.technician_id is null then raise exception 'Assign a technician to the job before creating an estimate';end if;
 if j.customer_id is distinct from new.customer_id then raise exception 'The estimate customer must match the assigned job';end if;
 if j.status in ('cancelled','completed') then raise exception 'Select an open job for this estimate';end if;
 if not exists(select 1 from public.team where id=j.technician_id and role='technician' and status='active') then raise exception 'Assign an active technician before creating an estimate';end if;
 return new;
end;$$;
create trigger require_estimate_assignment before insert on public.estimates for each row execute function private.require_estimate_assignment();
create function private.link_estimate_job() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 update public.jobs set estimate_id=new.id where id=new.converted_job_id and estimate_id is null;
 return new;
end;$$;
create trigger link_estimate_job after insert on public.estimates for each row execute function private.link_estimate_job();
revoke all on function private.require_estimate_assignment(),private.link_estimate_job() from public,anon;
