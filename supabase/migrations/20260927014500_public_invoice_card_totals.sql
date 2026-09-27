-- Public invoice page: expose persisted Square card fee/total from invoice app_data.
create or replace function public.get_public_invoice_payment_page(
  p_invoice_id text,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text;
  v_ok boolean;
  v_result jsonb;
begin
  if nullif(btrim(coalesce(p_invoice_id,'')),'') is null
     or p_access_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Invalid invoice access token';
  end if;

  v_hash := encode(extensions.digest(lower(p_access_token),'sha256'),'hex');

  select exists(
    select 1 from public.public_invoice_access_tokens t
    where t.invoice_id=p_invoice_id
      and t.token_hash=v_hash
      and t.revoked_at is null
      and t.expires_at>now()
  ) into v_ok;

  if not v_ok then raise exception 'Invoice access expired or invalid'; end if;

  select jsonb_build_object(
    'id',i.id,
    'number',i.number,
    'customer_name',i.customer_name,
    'date',i.date,
    'due_term',i.due_term,
    'items',coalesce(i.items,'[]'::jsonb),
    'tax_rate',i.tax_rate,
    'discount',i.discount,
    'payments',coalesce(i.payments,'[]'::jsonb),
    'payment_link',i.payment_link,
    'payment_provider',i.payment_provider,
    'card_base',nullif(i.app_data->>'squareCardBase','')::numeric,
    'card_fee',nullif(i.app_data->>'squareCardFee','')::numeric,
    'card_total',nullif(i.app_data->>'squareCardTotal','')::numeric
  )
  into v_result
  from public.invoices i
  where i.id=p_invoice_id and i.deleted_at is null
  limit 1;

  return v_result;
end;
$function$;

revoke all on function public.get_public_invoice_payment_page(text,text) from public;
grant execute on function public.get_public_invoice_payment_page(text,text) to anon, authenticated, service_role;
