create or replace function public.service_save_technician_pay_statement(p_id uuid,p_actor text,p_technician text,p_from date,p_to date,p_details jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.technician_pay_statements; item jsonb;
begin
 if not exists(select 1 from public.team where id=p_actor and status='active' and role in ('owner','admin')) then raise exception 'Owner required';end if;
 select * into result from public.technician_pay_statements where id=p_id;
 if found then
  if result.technician_id<>p_technician or result.period_from<>p_from or result.period_to<>p_to then raise exception 'Request ID mismatch';end if;
  return to_jsonb(result);
 end if;
 if jsonb_array_length(p_details->'rows')=0 or (p_details->>'technicianId')<>p_technician then raise exception 'Invalid statement';end if;
 insert into public.technician_pay_statements(id,technician_id,period_from,period_to,details,net_due,created_by)
 values(p_id,p_technician,p_from,p_to,p_details,(p_details->>'netDue')::numeric,p_actor) returning * into result;
 for item in select * from jsonb_array_elements(p_details->'rows') loop
  insert into public.technician_pay_statement_jobs(job_id,statement_id) values(item->>'jobId',p_id);
 end loop;
 insert into public.audit_log(id,action,summary,entity_type,entity_id,source,created_by_team_id,details)
 values(gen_random_uuid()::text,'pay_statement_created','Technician pay statement generated','payroll',p_technician,'app_client',p_actor,jsonb_build_object('statement_id',p_id,'from',p_from,'to',p_to,'net_due',result.net_due));
 return to_jsonb(result);
end $$;

create or replace function private.record_technician_pay_payment(p_id uuid,p_statement uuid,p_amount numeric,p_method text,p_reference text,p_paid_on date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor text; statement public.technician_pay_statements; paid numeric; receipt public.technician_pay_statement_payments;
begin
 select id into actor from public.team where auth_user_id=(select auth.uid()) and status='active' and role in ('owner','admin');
 if actor is null then raise exception 'Owner required';end if;
 select * into statement from public.technician_pay_statements where id=p_statement for update;
 if not found or statement.status='void' then raise exception 'Statement unavailable';end if;
 select * into receipt from public.technician_pay_statement_payments where id=p_id;
 if found then
  if receipt.statement_id<>p_statement or receipt.amount<>round(p_amount,2) or receipt.method<>p_method or receipt.reference<>trim(p_reference) or receipt.paid_on<>p_paid_on then raise exception 'Request ID mismatch';end if;
  return to_jsonb(receipt);
 end if;
 select coalesce(sum(amount),0) into paid from public.technician_pay_statement_payments where statement_id=p_statement;
 if p_amount is null or round(p_amount,2)<=0 or round(p_amount,2)>statement.net_due-paid or p_paid_on is null or p_paid_on>current_date then raise exception 'Invalid payment amount or date';end if;
 insert into public.technician_pay_statement_payments(id,statement_id,amount,method,reference,paid_on,created_by)
 values(p_id,p_statement,round(p_amount,2),p_method,trim(p_reference),p_paid_on,actor) returning * into receipt;
 if paid+receipt.amount>=statement.net_due then update public.technician_pay_statements set status='paid' where id=p_statement;end if;
 insert into public.audit_log(id,action,summary,entity_type,entity_id,source,created_by_team_id,details)
 values(gen_random_uuid()::text,'technician_payment_recorded','Technician payment recorded','payroll',statement.technician_id,'app_client',actor,jsonb_build_object('statement_id',p_statement,'amount',receipt.amount,'method',p_method));
 return to_jsonb(receipt);
end $$;

create or replace function private.void_technician_pay_statement(p_statement uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor text; statement public.technician_pay_statements;
begin
 select id into actor from public.team where auth_user_id=(select auth.uid()) and status='active' and role in ('owner','admin');if actor is null then raise exception 'Owner required';end if;
 select * into statement from public.technician_pay_statements where id=p_statement for update;if not found then raise exception 'Not found';end if;
 if exists(select 1 from public.technician_pay_statement_payments where statement_id=p_statement) then raise exception 'Paid statements cannot be voided';end if;
 update public.technician_pay_statements set status='void' where id=p_statement;
 delete from public.technician_pay_statement_jobs where statement_id=p_statement;
 insert into public.audit_log(id,action,summary,entity_type,entity_id,source,created_by_team_id,details) values(gen_random_uuid()::text,'pay_statement_voided','Unpaid pay statement voided','payroll',statement.technician_id,'app_client',actor,jsonb_build_object('statement_id',p_statement));
end $$;
