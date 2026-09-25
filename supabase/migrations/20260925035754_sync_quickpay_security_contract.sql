-- Keep the production Quick Payment RPC contract in version control and
-- prevent future functions from becoming Data API endpoints by default.

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- Legacy 8-argument QuickPay creator is no longer used by the current CRM.
revoke execute on function public.technician_create_quickpay_invoice(
  text,text,text,text,text,jsonb,numeric,text
) from public, anon, authenticated;

create or replace function public.technician_create_quickpay_invoice(
  p_customer_id text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_address text,
  p_items jsonb,
  p_tax_rate numeric default 6.25,
  p_preferred_payment_method text default 'cash',
  p_parts_cost numeric default 0,
  p_parts_owner text default 'company'
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_team text;
  v_customer text;
  v_invoice text;
  v_number text;
  v_method text;
  v_owner text;
begin
  v_team := public.current_team_id();
  if v_team is null then raise exception 'Active team session required'; end if;
  if not public.has_app_role(array['technician','owner','admin','dispatcher','office']::text[]) then
    raise exception 'Not authorized';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Invoice items required';
  end if;

  v_method := lower(coalesce(p_preferred_payment_method,'cash'));
  if v_method='card' then v_method:='square'; end if;
  if v_method not in ('cash','check','zelle','square') then
    raise exception 'Unsupported payment method';
  end if;

  v_owner := lower(coalesce(p_parts_owner,'company'));
  if v_owner not in ('company','technician') then raise exception 'Unsupported parts owner'; end if;
  if coalesce(p_parts_cost,0) < 0 then raise exception 'Parts cost cannot be negative'; end if;

  v_customer := nullif(p_customer_id,'');
  if v_customer is null then
    if nullif(trim(p_customer_name),'') is null then raise exception 'Customer name required'; end if;

    select c.id into v_customer
    from public.customers c
    where c.deleted_at is null
      and (
        (nullif(trim(p_customer_email),'') is not null and lower(c.email)=lower(trim(p_customer_email)))
        or
        (nullif(regexp_replace(coalesce(p_customer_phone,''),'\\D','','g'),'') is not null
         and regexp_replace(coalesce(c.phone,''),'\\D','','g')=regexp_replace(p_customer_phone,'\\D','','g'))
      )
    limit 1;

    if v_customer is null then
      v_customer := 'cust_'||replace(gen_random_uuid()::text,'-','');
      insert into public.customers(id,name,phone,email,address,notes,app_data)
      values(
        v_customer,
        trim(p_customer_name),
        nullif(trim(p_customer_phone),''),
        nullif(trim(p_customer_email),''),
        nullif(trim(p_customer_address),''),
        'Created from Quick Payment',
        jsonb_build_object('createdByTechnicianId',v_team)
      );
    end if;
  end if;

  v_invoice := 'inv_'||replace(gen_random_uuid()::text,'-','');
  v_number := public.next_invoice_number();

  insert into public.invoices(
    id,number,customer_id,customer_name,customer_phone,customer_email,customer_address,
    date,due_term,tax_rate,discount,deposit_required,items,payments,photos,
    preferred_payment_method,app_data
  )
  values(
    v_invoice,v_number,v_customer,p_customer_name,p_customer_phone,p_customer_email,p_customer_address,
    current_date,'Due on receipt',coalesce(p_tax_rate,6.25),0,0,p_items,'[]'::jsonb,'[]'::jsonb,
    v_method,
    jsonb_build_object(
      'createdByTechnicianId',v_team,
      'quickPay',true,
      'partsCost',coalesce(p_parts_cost,0),
      'partsOwner',v_owner
    )
  );

  return v_invoice;
end;
$function$;

revoke all on function public.technician_create_quickpay_invoice(
  text,text,text,text,text,jsonb,numeric,text,numeric,text
) from public;
revoke execute on function public.technician_create_quickpay_invoice(
  text,text,text,text,text,jsonb,numeric,text,numeric,text
) from anon;
grant execute on function public.technician_create_quickpay_invoice(
  text,text,text,text,text,jsonb,numeric,text,numeric,text
) to authenticated, service_role;

create or replace function public.technician_record_quickpay_payment(
  p_invoice_id text,
  p_method text,
  p_expected_row_version bigint
)
returns public.invoices
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_team text;
  v_inv public.invoices;
  v_method text;
  v_subtotal numeric := 0;
  v_taxable numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_payment jsonb;
begin
  v_team := public.current_team_id();
  if v_team is null then raise exception 'Active team session required'; end if;
  if not public.has_app_role(array['technician','owner','admin','dispatcher','office']::text[]) then
    raise exception 'Not authorized';
  end if;

  v_method := lower(coalesce(p_method,''));
  if v_method not in ('cash','check','zelle') then
    raise exception 'Only cash, check, or Zelle may be manually confirmed here';
  end if;

  select * into v_inv
  from public.invoices
  where id=p_invoice_id and deleted_at is null
  for update;

  if not found then raise exception 'Invoice not found'; end if;
  if v_inv.row_version <> p_expected_row_version then
    raise exception 'Invoice changed while payment was being recorded. Refresh and try again.' using errcode='40001';
  end if;

  if coalesce(v_inv.app_data->>'createdByTechnicianId','') <> v_team
     and not public.has_app_role(array['owner','admin','dispatcher','office']::text[]) then
    raise exception 'Invoice is not available to this technician';
  end if;

  select
    coalesce(sum(coalesce((x->>'qty')::numeric,1)*coalesce((x->>'rate')::numeric,0)),0),
    coalesce(sum(case when coalesce((x->>'taxable')::boolean,false)
      then coalesce((x->>'qty')::numeric,1)*coalesce((x->>'rate')::numeric,0) else 0 end),0)
  into v_subtotal,v_taxable
  from jsonb_array_elements(coalesce(v_inv.items,'[]'::jsonb)) x;

  v_tax := round(v_taxable*coalesce(v_inv.tax_rate,0)/100,2);
  v_total := round(greatest(0,v_subtotal-coalesce(v_inv.discount,0))+v_tax,2);

  if v_total <= 0 then raise exception 'Invoice balance must be greater than zero'; end if;
  if jsonb_array_length(coalesce(v_inv.payments,'[]'::jsonb)) > 0 then
    raise exception 'Invoice already has a payment; use the normal payment workflow';
  end if;

  v_payment := jsonb_build_object(
    'id','pay_'||replace(gen_random_uuid()::text,'-',''),
    'amount',v_total,
    'appliedAmount',v_total,
    'cardFee',0,
    'chargedAmount',v_total,
    'method',initcap(v_method),
    'date',current_date::text,
    'type','payment',
    'confirmedByTechnicianId',v_team
  );

  update public.invoices
  set payments=coalesce(payments,'[]'::jsonb)||jsonb_build_array(v_payment)
  where id=p_invoice_id
  returning * into v_inv;

  return v_inv;
end;
$function$;

revoke all on function public.technician_record_quickpay_payment(text,text,bigint) from public;
revoke execute on function public.technician_record_quickpay_payment(text,text,bigint) from anon;
grant execute on function public.technician_record_quickpay_payment(text,text,bigint) to authenticated, service_role;

create or replace function public.record_quickpay_sms_consent(
  p_phone_e164 text,
  p_invoice_id text,
  p_signer_name text,
  p_signature_data_url text,
  p_consent_text text,
  p_consent_version text,
  p_source_url text,
  p_signed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_team_id text;
  v_role text;
  v_app_data jsonb;
  v_job_id text;
  v_job_assigned boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select t.id, lower(coalesce(t.role,''))
    into v_team_id, v_role
  from public.team t
  where t.auth_user_id = auth.uid()
    and lower(coalesce(t.status,'active')) = 'active'
  limit 1;

  if v_team_id is null then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;

  if p_phone_e164 is null or p_phone_e164 !~ '^\\+[1-9][0-9]{7,14}$' then
    raise exception 'Valid E.164 phone number required';
  end if;
  if nullif(btrim(coalesce(p_signer_name,'')), '') is null then raise exception 'Signer name required'; end if;
  if nullif(btrim(coalesce(p_signature_data_url,'')), '') is null then raise exception 'Customer signature required'; end if;

  select i.app_data, i.job_id
    into v_app_data, v_job_id
  from public.invoices i
  where i.id = p_invoice_id and i.deleted_at is null;

  if not found then raise exception 'Invoice not available' using errcode = 'P0002'; end if;

  if v_job_id is not null then
    select exists(
      select 1 from public.jobs j
      where j.id=v_job_id and j.deleted_at is null and j.technician_id=v_team_id
    ) into v_job_assigned;
  end if;

  if v_role not in ('owner','admin','dispatcher','office')
     and coalesce(v_app_data->>'createdByTechnicianId','') <> v_team_id
     and not v_job_assigned then
    raise exception 'Invoice not available to this technician' using errcode = '42501';
  end if;

  insert into public.sms_consent(
    phone_e164,status,source,evidence_message_id,last_keyword,opted_in_at,opted_out_at,
    notes,consent_text,consent_version,source_url,form_submission_id,signer_name,
    signature_data_url,consent_invoice_id,consented_by_team_id,updated_at
  )
  values(
    p_phone_e164,'opted_in','quickpay_customer_signature',null,'SIGNED',coalesce(p_signed_at,now()),null,
    'Customer signed SMS consent on Quick Pay device',p_consent_text,p_consent_version,p_source_url,
    'quickpay-'||p_invoice_id,p_signer_name,p_signature_data_url,p_invoice_id,v_team_id,now()
  )
  on conflict (phone_e164) do update set
    status='opted_in',
    source='quickpay_customer_signature',
    evidence_message_id=null,
    last_keyword='SIGNED',
    opted_in_at=excluded.opted_in_at,
    opted_out_at=null,
    notes=excluded.notes,
    consent_text=excluded.consent_text,
    consent_version=excluded.consent_version,
    source_url=excluded.source_url,
    form_submission_id=excluded.form_submission_id,
    signer_name=excluded.signer_name,
    signature_data_url=excluded.signature_data_url,
    consent_invoice_id=excluded.consent_invoice_id,
    consented_by_team_id=excluded.consented_by_team_id,
    updated_at=now();

  return jsonb_build_object('ok',true,'phone_e164',p_phone_e164,'invoice_id',p_invoice_id,'team_id',v_team_id);
end;
$function$;

revoke all on function public.record_quickpay_sms_consent(text,text,text,text,text,text,text,timestamptz) from public;
revoke execute on function public.record_quickpay_sms_consent(text,text,text,text,text,text,text,timestamptz) from anon;
grant execute on function public.record_quickpay_sms_consent(text,text,text,text,text,text,text,timestamptz) to authenticated, service_role;
