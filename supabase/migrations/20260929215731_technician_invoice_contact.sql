-- Save document contact details without granting technicians customer CRUD.
grant crm_workflow_executor to postgres;
grant create on schema private to crm_workflow_executor;
create function private.technician_set_invoice_contact(p_invoice_id text,p_field text,p_value text,p_expected_row_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tid text; inv public.invoices%rowtype; val text:=btrim(p_value); assigned text;
begin
 select id into tid from public.team where auth_user_id=auth.uid() and role='technician' and status='active' for share;
 if tid is null then raise exception 'Active technician required' using errcode='42501'; end if;
 if p_field is null or p_field not in ('email','phone') or val is null or length(val)=0 or length(val)>254 then raise exception 'Valid contact field and value required' using errcode='22023'; end if;
 if p_field='email' and val !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Valid email address required' using errcode='22023'; end if;
 if p_field='phone' and val !~ '^[+][1-9][0-9]{7,14}$' then raise exception 'Valid E.164 phone number required' using errcode='22023'; end if;
 select * into inv from public.invoices where id=p_invoice_id and deleted_at is null for update;
 if not found then raise exception 'Invoice unavailable' using errcode='42501'; end if;
 if inv.job_id is not null then
  select technician_id into assigned from public.jobs where id=inv.job_id and deleted_at is null for share;
  if assigned is distinct from tid then raise exception 'Invoice unavailable' using errcode='42501'; end if;
 elsif coalesce(inv.app_data->>'createdByTechnicianId',inv.app_data->>'created_by_technician_id','')<>tid then
  raise exception 'Invoice unavailable' using errcode='42501';
 end if;
 if p_expected_row_version is null or inv.row_version<>p_expected_row_version then raise exception 'Invoice changed. Refresh and try again.' using errcode='40001'; end if;
 update public.invoices set customer_email=case when p_field='email' then val else customer_email end,
 customer_phone=case when p_field='phone' then val else customer_phone end where id=inv.id returning * into inv;
 return to_jsonb(inv);
end;$$;
alter function private.technician_set_invoice_contact(text,text,text,bigint) owner to crm_workflow_executor;
create function public.technician_set_invoice_contact(p_invoice_id text,p_field text,p_value text,p_expected_row_version bigint)
returns jsonb language sql security invoker set search_path='' as $$select private.technician_set_invoice_contact(p_invoice_id,p_field,p_value,p_expected_row_version)$$;
revoke all on function private.technician_set_invoice_contact(text,text,text,bigint),public.technician_set_invoice_contact(text,text,text,bigint) from public,anon;
grant execute on function private.technician_set_invoice_contact(text,text,text,bigint),public.technician_set_invoice_contact(text,text,text,bigint) to authenticated;
revoke create on schema private from crm_workflow_executor;
revoke crm_workflow_executor from postgres;
