-- Cancel a waiting offer without treating it as an accepted assignment.
grant crm_workflow_executor to postgres;
grant create on schema private to crm_workflow_executor;
create function private.cancel_pending_lead_offer(p_lead_id text,p_expected_offer_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.leads%rowtype;j public.jobs%rowtype;o public.lead_offers%rowtype;
begin
 if auth.uid() is null or public.is_office() is not true then raise exception 'Office access required';end if;
 select * into l from public.leads where id=p_lead_id and deleted_at is null for update;
 if not found then raise exception 'Lead not available';end if;
 select * into o from public.lead_offers where id=p_expected_offer_id and lead_id=l.id for update;
 if not found or o.status<>'pending' or l.assigned_technician_id is not null then raise exception 'Offer changed. Refresh the lead before trying again';end if;
 select * into j from public.jobs where id=l.converted_job_id and deleted_at is null for update;
 if not found or j.technician_id is not null then raise exception 'Assignment changed. Refresh the lead before trying again';end if;
 update public.lead_offers set status='cancelled',responded_at=clock_timestamp() where id=o.id;
 insert into public.audit_log(id,action,summary,entity_type,entity_id,source,read)
 values(gen_random_uuid()::text,'lead_offer_cancelled','Pending offer returned to office by '||public.current_team_id(),'lead_offers',o.id::text,'system',false);
 return jsonb_build_object('lead_id',l.id,'job_id',j.id,'status','unassigned');
end;$$;
alter function private.cancel_pending_lead_offer(text,uuid) owner to crm_workflow_executor;
create function public.cancel_pending_lead_offer(p_lead_id text,p_expected_offer_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.cancel_pending_lead_offer(p_lead_id,p_expected_offer_id)$$;
revoke all on function private.cancel_pending_lead_offer(text,uuid),public.cancel_pending_lead_offer(text,uuid) from public,anon;
grant execute on function private.cancel_pending_lead_offer(text,uuid),public.cancel_pending_lead_offer(text,uuid) to authenticated;
revoke create on schema private from crm_workflow_executor;
revoke crm_workflow_executor from postgres;
