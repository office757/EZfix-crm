-- Harden Quick Payment job linking.
-- Linking an invoice to a job must never complete the job without the separate
-- customer-signature completion workflow.

create or replace function public.technician_link_quickpay_invoice_to_job(
  p_invoice_id text,
  p_job_id text,
  p_parts_cost numeric default 0,
  p_parts_owner text default 'company'
)
returns public.jobs
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_team text;
  v_role text;
  v_job public.jobs;
  v_inv public.invoices;
  v_owner text;
begin
  v_team := public.current_team_id();
  v_role := lower(coalesce(public.current_app_role(),''));

  if v_team is null then
    raise exception 'Active team session required';
  end if;
  if v_role not in ('technician','owner','admin','dispatcher','office') then
    raise exception 'Not authorized';
  end if;

  v_owner := lower(coalesce(p_parts_owner,'company'));
  if v_owner not in ('company','technician') then
    raise exception 'Unsupported parts owner';
  end if;
  if coalesce(p_parts_cost,0) < 0 then
    raise exception 'Parts cost cannot be negative';
  end if;

  select *
    into v_job
  from public.jobs
  where id = p_job_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Job not found';
  end if;

  if v_role = 'technician' and coalesce(v_job.technician_id,'') <> v_team then
    raise exception 'Assigned job not available to this technician';
  end if;

  select *
    into v_inv
  from public.invoices
  where id = p_invoice_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_role = 'technician'
     and coalesce(v_inv.app_data->>'createdByTechnicianId','') <> v_team then
    raise exception 'Quick Pay invoice is not available to this technician';
  end if;

  update public.invoices
  set job_id = p_job_id,
      updated_at = now()
  where id = p_invoice_id;

  update public.jobs
  set material_cost = coalesce(p_parts_cost,0),
      payment_method = initcap(coalesce(v_inv.preferred_payment_method,'')),
      app_data = coalesce(app_data,'{}'::jsonb)
        || jsonb_build_object(
             'partsOwner',v_owner,
             'quickPayInvoiceId',p_invoice_id
           ),
      updated_at = now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$function$;

revoke all on function public.technician_link_quickpay_invoice_to_job(text,text,numeric,text) from public;
revoke execute on function public.technician_link_quickpay_invoice_to_job(text,text,numeric,text) from anon;
grant execute on function public.technician_link_quickpay_invoice_to_job(text,text,numeric,text) to authenticated;
grant execute on function public.technician_link_quickpay_invoice_to_job(text,text,numeric,text) to service_role;
