-- Reuse validated Quick Payment creation and atomically link it to the accepted job.
grant select,update on public.invoices to crm_workflow_executor;
create policy dispatch_executor_invoices on public.invoices for all to crm_workflow_executor using(true) with check(true);
grant crm_workflow_executor to postgres;
grant create on schema private to crm_workflow_executor;
create function private.create_dispatch_invoice(p_job_id text,p_items jsonb,p_method text,p_parts_cost numeric,p_parts_owner text) returns text language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype;c public.customers%rowtype;tid text;inv text;pics jsonb;
begin
 tid:=public.current_team_id();if tid is null then raise exception 'Sign in required';end if;
 select * into j from public.jobs where id=p_job_id and deleted_at is null for update;
 if not found or j.workflow_version<>1 or not(public.is_office() or j.technician_id=tid) then raise exception 'Assigned job not available';end if;
 if j.status in ('cancelled','completed') then raise exception 'Job is closed';end if;
 if not exists(select 1 from public.job_evidence where job_id=j.id and kind='after') then raise exception 'Completion photos required before creating invoice';end if;
 select id into inv from public.invoices where job_id=j.id and deleted_at is null order by created_at limit 1;
 if inv is not null then return inv;end if;
 select * into c from public.customers where id=j.customer_id and deleted_at is null;
 if not found then raise exception 'Customer not available';end if;
 inv:=public.technician_create_quickpay_invoice(c.id,c.name,c.phone,c.email,coalesce(j.app_data->>'service_address',c.address),p_items,6.25,p_method,p_parts_cost,p_parts_owner);
 select coalesce(jsonb_agg(jsonb_build_object('id','crm-assets/'||storage_path,'category','After','evidenceId',id,'at',floor(extract(epoch from created_at)*1000))),'[]') into pics from public.job_evidence where job_id=j.id and kind='after';
 update public.invoices set job_id=j.id,photos=pics where id=inv;
 update public.jobs set material_cost=p_parts_cost,payment_method=p_method,app_data=coalesce(app_data,'{}')||jsonb_build_object('partsOwner',p_parts_owner,'quickPayInvoiceId',inv) where id=j.id;
 return inv;
end;$$;
alter function private.create_dispatch_invoice(text,jsonb,text,numeric,text) owner to crm_workflow_executor;
create function public.create_dispatch_invoice(p_job_id text,p_items jsonb,p_method text default 'cash',p_parts_cost numeric default 0,p_parts_owner text default 'company') returns text language sql security invoker set search_path='' as $$select private.create_dispatch_invoice(p_job_id,p_items,p_method,p_parts_cost,p_parts_owner)$$;
revoke all on function private.create_dispatch_invoice(text,jsonb,text,numeric,text),public.create_dispatch_invoice(text,jsonb,text,numeric,text) from public,anon;
grant execute on function private.create_dispatch_invoice(text,jsonb,text,numeric,text),public.create_dispatch_invoice(text,jsonb,text,numeric,text) to authenticated;
revoke create on schema private from crm_workflow_executor;
revoke crm_workflow_executor from postgres;
