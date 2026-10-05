-- Immutable, server-calculated statements; recording a payment does not move money.
create table public.technician_pay_statements (
 id uuid primary key, technician_id text not null references public.team(id),
 period_from date not null, period_to date not null check(period_to>period_from),
 details jsonb not null, net_due numeric(14,2) not null,
 status text not null default 'payable' check(status in ('payable','paid','void')),
 created_by text not null references public.team(id), created_at timestamptz not null default now()
);
create index technician_pay_statements_tech_date on public.technician_pay_statements(technician_id,created_at desc);
create index technician_pay_statements_actor on public.technician_pay_statements(created_by);
create table public.technician_pay_statement_jobs (
 job_id text primary key references public.jobs(id), statement_id uuid not null references public.technician_pay_statements(id)
);
create index technician_pay_statement_jobs_statement on public.technician_pay_statement_jobs(statement_id);
create table public.technician_pay_statement_payments (
 id uuid primary key, statement_id uuid not null references public.technician_pay_statements(id),
 amount numeric(14,2) not null check(amount>0), method text not null check(method in ('Bank transfer','Zelle','Cash','Check')),
 reference text not null check(length(reference) between 1 and 250), paid_on date not null,
 created_by text not null references public.team(id), created_at timestamptz not null default now()
);
create index technician_pay_statement_payments_statement on public.technician_pay_statement_payments(statement_id);
create index technician_pay_statement_payments_actor on public.technician_pay_statement_payments(created_by);
alter table public.technician_pay_statements enable row level security;
alter table public.technician_pay_statement_jobs enable row level security;
alter table public.technician_pay_statement_payments enable row level security;
revoke all on public.technician_pay_statements,public.technician_pay_statement_jobs,public.technician_pay_statement_payments from anon,authenticated;
grant select on public.technician_pay_statements,public.technician_pay_statement_jobs,public.technician_pay_statement_payments to authenticated;
grant all on public.technician_pay_statements,public.technician_pay_statement_jobs,public.technician_pay_statement_payments to service_role;
create policy pay_statement_read on public.technician_pay_statements for select to authenticated using ((select public.is_office()) or technician_id=(select public.current_team_id()));
create policy pay_statement_jobs_read on public.technician_pay_statement_jobs for select to authenticated using (exists(select 1 from public.technician_pay_statements s where s.id=statement_id));
create policy pay_statement_payments_read on public.technician_pay_statement_payments for select to authenticated using (exists(select 1 from public.technician_pay_statements s where s.id=statement_id));
-- Invoker functions use the service role only; the edge function validates the signed-in, active actor.
create function public.service_save_technician_pay_statement(p_id uuid,p_actor text,p_technician text,p_from date,p_to date,p_details jsonb)
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
revoke all on function public.service_save_technician_pay_statement(uuid,text,text,date,date,jsonb) from public,anon,authenticated;
grant execute on function public.service_save_technician_pay_statement(uuid,text,text,date,date,jsonb) to service_role;
-- Owner payment recording goes through a row lock; prevents duplicate requests and overpayment.
create function private.record_technician_pay_payment(p_id uuid,p_statement uuid,p_amount numeric,p_method text,p_reference text,p_paid_on date)
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
revoke all on function private.record_technician_pay_payment(uuid,uuid,numeric,text,text,date) from public,anon;
grant execute on function private.record_technician_pay_payment(uuid,uuid,numeric,text,text,date) to authenticated;
create function private.void_technician_pay_statement(p_statement uuid)
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
revoke all on function private.void_technician_pay_statement(uuid) from public,anon;
grant execute on function private.void_technician_pay_statement(uuid) to authenticated;
-- Hourly checks produce one owner notification per technician and local weekly period.
create table private.payroll_reminder_runs(technician_id text not null references public.team(id),period_end date not null,created_at timestamptz not null default now(),primary key(technician_id,period_end));
alter table private.payroll_reminder_runs enable row level security;
revoke all on private.payroll_reminder_runs from public,anon,authenticated;
create function private.queue_weekly_payroll_reminders()
returns integer language plpgsql security definer set search_path='' as $$
declare member record; cfg jsonb; local_now timestamp; ending date; inserted integer; total integer:=0;
begin
 for member in select id,name,app_data from public.team where status='active' and role='technician' loop
  cfg:=member.app_data->'payroll_reminder';
  if coalesce(cfg->>'enabled','false')<>'true' then continue;end if;
  if (cfg->>'time_zone') not in ('America/New_York','America/Chicago','America/Denver','America/Los_Angeles') or coalesce(cfg->>'weekday','')!~'^[0-6]$' or coalesce(cfg->>'hour','')!~'^(?:[0-9]|1[0-9]|2[0-3])$' then continue;end if;
  local_now:=now() at time zone (cfg->>'time_zone');
  ending:=local_now::date-((extract(dow from local_now)::integer-(cfg->>'weekday')::integer+7)%7);
  if local_now::date=ending and extract(hour from local_now)<(cfg->>'hour')::integer then continue;end if;
  insert into private.payroll_reminder_runs(technician_id,period_end) values(member.id,ending) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted>0 then
   insert into public.audit_log(id,action,summary,entity_type,entity_id,source,priority,read,details)
   values(gen_random_uuid()::text,'payroll_due',member.name||': weekly payment review due ('||(ending-7)::text||' to '||ending::text||')','payroll',member.id,'system','high',false,jsonb_build_object('technician_id',member.id,'period_from',ending-7,'period_to',ending,'end_exclusive',true));total:=total+1;
  end if;
 end loop;
 return total;
end $$;
revoke all on function private.queue_weekly_payroll_reminders() from public,anon,authenticated;
select cron.schedule('ezfix-weekly-payroll-reminders','0 * * * *','select private.queue_weekly_payroll_reminders();');
create function private.set_technician_pay_reminder(p_technician text,p_settings jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.team where auth_user_id=(select auth.uid()) and status='active' and role in ('owner','admin')) then raise exception 'Owner required';end if;
 if jsonb_typeof(p_settings->'enabled')<>'boolean' or coalesce(p_settings->>'weekday','')!~'^[0-6]$' or coalesce(p_settings->>'hour','')!~'^(?:[0-9]|1[0-9]|2[0-3])$' or coalesce(p_settings->>'time_zone','') not in ('America/New_York','America/Chicago','America/Denver','America/Los_Angeles') then raise exception 'Invalid reminder settings';end if;
 update public.team set app_data=coalesce(app_data,'{}')||jsonb_build_object('payroll_reminder',p_settings) where id=p_technician and role='technician';if not found then raise exception 'Technician not found';end if;
end $$;
revoke all on function private.set_technician_pay_reminder(text,jsonb) from public,anon;
grant execute on function private.set_technician_pay_reminder(text,jsonb) to authenticated;

create function public.record_technician_pay_payment(p_id uuid,p_statement uuid,p_amount numeric,p_method text,p_reference text,p_paid_on date) returns jsonb language sql security invoker set search_path='' as $$ select private.record_technician_pay_payment(p_id,p_statement,p_amount,p_method,p_reference,p_paid_on); $$;
revoke all on function public.record_technician_pay_payment(uuid,uuid,numeric,text,text,date) from public,anon;
grant execute on function public.record_technician_pay_payment(uuid,uuid,numeric,text,text,date) to authenticated;

create function public.void_technician_pay_statement(p_statement uuid) returns void language sql security invoker set search_path='' as $$ select private.void_technician_pay_statement(p_statement); $$;
revoke all on function public.void_technician_pay_statement(uuid) from public,anon;
grant execute on function public.void_technician_pay_statement(uuid) to authenticated;

create function public.set_technician_pay_reminder(p_technician text,p_settings jsonb) returns void language sql security invoker set search_path='' as $$ select private.set_technician_pay_reminder(p_technician,p_settings); $$;
revoke all on function public.set_technician_pay_reminder(text,jsonb) from public,anon;
grant execute on function public.set_technician_pay_reminder(text,jsonb) to authenticated;

grant usage on schema private to authenticated;
