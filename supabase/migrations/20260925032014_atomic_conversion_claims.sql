-- Atomic lead/estimate conversion RPCs.
-- Row locks make conversions idempotent across tabs/devices and return the existing target on retry.

create or replace function public.convert_lead_to_customer_job(p_lead_id text)
returns table(customer_id text, job_id text, was_existing boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  l public.leads%rowtype;
  v_customer_id text;
  v_job_id text;
  v_address text;
  v_scheduled_date date;
begin
  if not public.is_owner() then
    raise exception 'convert_lead_to_customer_job: owner access required';
  end if;

  select * into l
  from public.leads
  where id = p_lead_id and deleted_at is null
  for update;

  if not found then raise exception 'Lead not found'; end if;

  if l.converted_customer_id is not null or l.converted_job_id is not null then
    if l.converted_customer_id is null or l.converted_job_id is null then
      raise exception 'Lead conversion is in an inconsistent partial state';
    end if;
    return query select l.converted_customer_id, l.converted_job_id, true;
    return;
  end if;

  v_customer_id := 'id' || to_hex((extract(epoch from clock_timestamp())*1000)::bigint)
    || substr(md5(random()::text || clock_timestamp()::text),1,6);
  v_job_id := 'id' || to_hex((extract(epoch from clock_timestamp())*1000)::bigint)
    || substr(md5(random()::text || clock_timestamp()::text),1,6);

  v_address := concat_ws(', ', nullif(l.address,''), nullif(l.app_data->>'city',''),
    nullif(l.app_data->>'state',''), nullif(l.app_data->>'zip',''));

  if coalesce(l.app_data->>'preferred_appointment','') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_scheduled_date := (l.app_data->>'preferred_appointment')::date;
  elsif coalesce(l.app_data->>'preferred_date','') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_scheduled_date := (l.app_data->>'preferred_date')::date;
  end if;

  insert into public.customers(id,name,email,phone,address,notes,app_data)
  values (
    v_customer_id, l.name, l.email, l.phone, nullif(v_address,''),
    trim(concat('Converted from lead. ',coalesce(l.notes,''))),
    jsonb_build_object('leadSource',coalesce(l.source,''),'tags','[]'::jsonb)
  );

  insert into public.jobs(
    id,customer_id,technician_id,customer_name,technician,title,description,
    status,scheduled_date,status_history,app_data
  ) values (
    v_job_id,v_customer_id,l.assigned_technician_id,l.name,
    nullif(l.app_data->>'assigned_technician',''),
    coalesce(nullif(l.service_requested,''),'New job'),l.notes,'new',v_scheduled_date,
    jsonb_build_array(jsonb_build_object('status','new','at',floor(extract(epoch from clock_timestamp())*1000))),
    jsonb_build_object('sourceLeadId',l.id)
  );

  update public.leads
  set status='converted', converted_customer_id=v_customer_id,
      converted_job_id=v_job_id, updated_at=now()
  where id=l.id;

  return query select v_customer_id, v_job_id, false;
end;
$$;

revoke all on function public.convert_lead_to_customer_job(text) from public;
grant execute on function public.convert_lead_to_customer_job(text) to authenticated;

create or replace function public.convert_estimate_to_job(p_estimate_id text)
returns table(job_id text, was_existing boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  e public.estimates%rowtype;
  v_job_id text;
  v_summary text;
begin
  if not public.is_owner() then
    raise exception 'convert_estimate_to_job: owner access required';
  end if;

  select * into e
  from public.estimates
  where id=p_estimate_id and deleted_at is null
  for update;

  if not found then raise exception 'Estimate not found'; end if;

  if e.converted_job_id is not null then
    return query select e.converted_job_id, true;
    return;
  end if;

  select string_agg(coalesce(x->>'desc',x->>'description',''), ', ' order by ord)
  into v_summary
  from jsonb_array_elements(coalesce(e.items,'[]'::jsonb)) with ordinality as t(x,ord)
  where coalesce(x->>'desc',x->>'description','') <> '';

  v_job_id := 'id' || to_hex((extract(epoch from clock_timestamp())*1000)::bigint)
    || substr(md5(random()::text || clock_timestamp()::text),1,6);

  insert into public.jobs(
    id,customer_id,estimate_id,customer_name,title,description,status,status_history,app_data
  ) values (
    v_job_id,e.customer_id,e.id,e.customer_name,
    coalesce(nullif(left(v_summary,80),''),'Job from '||coalesce(e.number,e.id)),
    coalesce(v_summary,''),'new',
    jsonb_build_array(jsonb_build_object('status','new','at',floor(extract(epoch from clock_timestamp())*1000))),
    jsonb_build_object('sourceEstimateId',e.id)
  );

  update public.estimates
  set converted_job_id=v_job_id, updated_at=now()
  where id=e.id;

  return query select v_job_id, false;
end;
$$;

revoke all on function public.convert_estimate_to_job(text) from public;
grant execute on function public.convert_estimate_to_job(text) to authenticated;
