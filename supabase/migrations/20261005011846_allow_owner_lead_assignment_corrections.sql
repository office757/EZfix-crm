-- Owner corrections must also synchronize the linked lead's dispatch identity.
create or replace function private.protect_dispatch_lead() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.partner_id is distinct from old.partner_id and not public.is_office() then raise exception 'Lead source is office managed';end if;
 if new.assigned_technician_id is distinct from old.assigned_technician_id
  and current_user<>'crm_workflow_executor' and not (auth.uid() is not null and public.is_owner())
  and exists(select 1 from public.jobs where id=new.converted_job_id and workflow_version=1)
 then raise exception 'Use a lead offer to assign this lead';end if;
 return new;
end;$$;
