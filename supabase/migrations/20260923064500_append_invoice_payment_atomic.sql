create or replace function public.append_invoice_payment(
  p_invoice_id text,
  p_payment jsonb,
  p_expected_row_version bigint
)
returns public.invoices
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices;
  v_payment_id text;
  v_applied numeric;
begin
  if jsonb_typeof(p_payment) is distinct from 'object' then
    raise exception 'Payment must be a JSON object.' using errcode = '22023';
  end if;

  v_payment_id := nullif(btrim(p_payment->>'id'), '');
  if v_payment_id is null then
    raise exception 'Payment id is required.' using errcode = '22023';
  end if;

  if p_expected_row_version is null then
    raise exception 'Expected invoice row version is required.' using errcode = '22023';
  end if;

  begin
    v_applied := coalesce(nullif(p_payment->>'appliedAmount','')::numeric, nullif(p_payment->>'amount','')::numeric);
  exception when invalid_text_representation then
    raise exception 'Payment amount must be numeric.' using errcode = '22023';
  end;
  if v_applied is null or v_applied <= 0 then
    raise exception 'Payment amount must be greater than zero.' using errcode = '22023';
  end if;

  update public.invoices i
  set payments = coalesce(i.payments, '[]'::jsonb) || jsonb_build_array(p_payment)
  where i.id = p_invoice_id
    and i.deleted_at is null
    and i.row_version = p_expected_row_version
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) e
      where e->>'id' = v_payment_id
    )
  returning i.* into v_invoice;

  if found then
    return v_invoice;
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
    and i.deleted_at is null
    and exists (
      select 1
      from jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) e
      where e->>'id' = v_payment_id
    );

  if found then
    return v_invoice;
  end if;

  if exists (
    select 1 from public.invoices i
    where i.id = p_invoice_id and i.deleted_at is null
  ) then
    raise exception 'Invoice changed while payment was being recorded. Refresh the balance and try again.' using errcode = '40001';
  end if;

  raise exception 'Invoice not found or payment update is not permitted.' using errcode = '42501';
end;
$$;

revoke all on function public.append_invoice_payment(text,jsonb,bigint) from public;
revoke all on function public.append_invoice_payment(text,jsonb,bigint) from anon;
grant execute on function public.append_invoice_payment(text,jsonb,bigint) to authenticated;
