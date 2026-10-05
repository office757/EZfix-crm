-- Owner business corrections on the current EZfix workspace. Keep RLS and staff workflow guards.
create or replace function private.enforce_job_workflow() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.workflow_version<>old.workflow_version and not (public.is_office() and old.workflow_version=0 and new.workflow_version=1 and old.status in ('new','scheduled','confirmed')) then raise exception 'Workflow version is server managed';end if;
 -- Owner identity is resolved from active team membership, never browser claims.
 if auth.uid() is not null and public.is_owner() then return new;end if;
 if new.workflow_version<1 then return new;end if;
 if tg_op='UPDATE' and new.technician_id is distinct from old.technician_id and current_user<>'crm_workflow_executor' then raise exception 'Use a lead offer to assign this job';end if;
 if new.status in ('arrived','inspection','estimate_presented','approved','work_in_progress','waiting_for_parts','work_finished','invoice_sent','paid','completed') and not exists(select 1 from public.job_evidence where job_id=new.id and kind='exterior') then raise exception 'Exterior arrival photo required';end if;
 if new.status in ('work_in_progress','waiting_for_parts','work_finished','invoice_sent','paid','completed') then
  if not exists(select 1 from public.job_evidence where job_id=new.id and kind='exterior') then raise exception 'Exterior arrival photo required';end if;
  if not exists(select 1 from public.job_evidence where job_id=new.id and kind='before') then raise exception 'Before-work parts or work-area photo required';end if;
 end if;
 if new.status in ('work_finished','invoice_sent','paid','completed') and not exists(select 1 from public.job_evidence where job_id=new.id and kind='after') then raise exception 'Installed parts / finished work photo required';end if;
 if new.status='completed' and not private.job_payment_receipt_ready(new.id) then raise exception 'Full payment and confirmed receipt delivery required before closing the job';end if;
 return new;
end;$$;

create or replace function public.enforce_job_completion_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_signature jsonb;
begin
  if auth.uid() is not null and public.is_owner() then return new;end if;
  -- Editing an already closed owner job does not invent a customer signature.
  if tg_op='UPDATE' and old.status='completed' and new.status='completed'
     and old.app_data->'completion_signature' is not distinct from new.app_data->'completion_signature' then return new;end if;
  if new.status = 'completed' then
    v_signature := coalesce(new.app_data, '{}'::jsonb)->'completion_signature';

    if v_signature is null
       or nullif(btrim(coalesce(v_signature->>'dataUrl','')), '') is null
       or nullif(btrim(coalesce(v_signature->>'name','')), '') is null
       or coalesce((v_signature->>'at')::numeric,0) <= 0
    then
      raise exception 'Job completion requires a customer signature'
        using errcode='23514';
    end if;
  end if;

  return new;
end;
$function$;


-- Cancel stale offers atomically when the owner directly corrects an assignment.
-- This trigger needs access to internal offers; it is not an exposed RPC.
create or replace function private.sync_owner_job_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_owner() or new.technician_id is not distinct from old.technician_id then return new;end if;
 update public.lead_offers o set status='cancelled',responded_at=now()
 where o.status='pending' and exists(select 1 from public.leads l where l.id=o.lead_id and l.converted_job_id=new.id);
 update public.leads set assigned_technician_id=new.technician_id,assigned_technician=new.technician,
  app_data=coalesce(app_data,'{}')||jsonb_build_object('assignment_status',case when new.technician_id is null then 'unassigned' else 'assigned' end)
 where converted_job_id=new.id and deleted_at is null;
 return new;
end;$$;
revoke all on function private.sync_owner_job_assignment() from public,anon,authenticated;
create trigger sync_owner_job_assignment after update of technician_id on public.jobs
for each row execute function private.sync_owner_job_assignment();
-- Existing capture_business_change records actor, before/after and changed fields
-- for jobs, leads, customers and invoices. No invoice/payment/provider fields change.
