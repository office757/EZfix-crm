-- Prevent technicians from rewriting security-sensitive linkage fields on assigned records.
create or replace function public.protect_technician_job_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if lower(coalesce(public.current_app_role(),'')) = 'technician' then
    if new.customer_id is distinct from old.customer_id
       or new.technician_id is distinct from old.technician_id
       or new.estimate_id is distinct from old.estimate_id
       or new.job_number is distinct from old.job_number
       or new.created_at is distinct from old.created_at
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Technician cannot change job ownership or linkage fields'
        using errcode='42501';
    end if;
  end if;
  return new;
end
$$;
revoke execute on function public.protect_technician_job_fields() from public, anon, authenticated;
drop trigger if exists protect_technician_job_fields_trg on public.jobs;
create trigger protect_technician_job_fields_trg
before update on public.jobs
for each row execute function public.protect_technician_job_fields();

create or replace function public.protect_technician_lead_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if lower(coalesce(public.current_app_role(),'')) = 'technician' then
    if new.assigned_technician_id is distinct from old.assigned_technician_id
       or new.source is distinct from old.source
       or new.source_email_id is distinct from old.source_email_id
       or new.source_provider is distinct from old.source_provider
       or new.source_channel is distinct from old.source_channel
       or new.source_call_id is distinct from old.source_call_id
       or new.converted_customer_id is distinct from old.converted_customer_id
       or new.converted_job_id is distinct from old.converted_job_id
       or new.created_at is distinct from old.created_at
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Technician cannot change lead assignment, source, or conversion linkage'
        using errcode='42501';
    end if;
  end if;
  return new;
end
$$;
revoke execute on function public.protect_technician_lead_fields() from public, anon, authenticated;
drop trigger if exists protect_technician_lead_fields_trg on public.leads;
create trigger protect_technician_lead_fields_trg
before update on public.leads
for each row execute function public.protect_technician_lead_fields();
