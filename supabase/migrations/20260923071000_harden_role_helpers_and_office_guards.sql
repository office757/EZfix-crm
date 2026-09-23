-- Public wrapper predicates delegate to current_app_role(), which remains
-- SECURITY DEFINER to avoid recursive team-table RLS evaluation.
alter function public.has_app_role(text[]) security invoker;
alter function public.is_owner() security invoker;
alter function public.is_office() security invoker;
alter function public.is_admin_or_owner() security invoker;

-- Owner RLS already protects all rows touched by conversion.
alter function public.convert_estimate_to_invoice(text) security invoker;

create or replace function public.is_office()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select public.has_app_role(array['owner','admin','dispatcher','office']::text[])
$$;

create or replace function public.protect_job_technician_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if public.is_office() then return new; end if;
  if new.customer_id is distinct from old.customer_id
     or new.technician_id is distinct from old.technician_id
     or new.estimate_id is distinct from old.estimate_id
     or new.customer_name is distinct from old.customer_name
     or new.technician is distinct from old.technician
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.complaint is distinct from old.complaint
     or new.payment_method is distinct from old.payment_method
     or new.property_type is distinct from old.property_type
     or new.door_size is distinct from old.door_size
     or new.door_quantity is distinct from old.door_quantity
     or new.material_cost is distinct from old.material_cost
     or new.scheduled_date is distinct from old.scheduled_date
     or new.appointment_window is distinct from old.appointment_window
     or new.job_number is distinct from old.job_number
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'jobs: technician may only update status, checklist, diagnosis, recommended_repair, internal_notes, photos, status_history, cancel_reason';
  end if;
  return new;
end;
$$;

create or replace function public.protect_lead_technician_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if public.is_office() then return new; end if;
  if new.name is distinct from old.name
     or new.email is distinct from old.email
     or new.phone is distinct from old.phone
     or new.address is distinct from old.address
     or new.service_requested is distinct from old.service_requested
     or new.source is distinct from old.source
     or new.source_email_id is distinct from old.source_email_id
     or new.source_provider is distinct from old.source_provider
     or new.source_channel is distinct from old.source_channel
     or new.source_call_id is distinct from old.source_call_id
     or new.assignment_status is distinct from old.assignment_status
     or new.converted_customer_id is distinct from old.converted_customer_id
     or new.converted_job_id is distinct from old.converted_job_id
     or new.assigned_technician_id is distinct from old.assigned_technician_id
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'leads: technician may only update status, notes, next_follow_up, last_contact, decline_reason';
  end if;
  return new;
end;
$$;
