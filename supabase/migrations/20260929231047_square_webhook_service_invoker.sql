CREATE OR REPLACE FUNCTION public.record_square_payment_from_webhook(p_event_id text, p_event_type text, p_merchant_id text, p_invoice_id text, p_payment_id text, p_order_id text, p_paid_at timestamp with time zone, p_applied_amount numeric, p_card_fee numeric, p_charged_amount numeric, p_receipt_url text DEFAULT NULL::text, p_card_brand text DEFAULT NULL::text, p_last4 text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_inv public.invoices%rowtype;
  v_existing jsonb;
  v_payment jsonb;
  v_payments jsonb;
  v_app jsonb;
  v_now timestamptz := now();
begin
  if coalesce(p_event_id,'') = '' or coalesce(p_invoice_id,'') = '' or coalesce(p_payment_id,'') = '' then
    raise exception 'event, invoice, and payment ids are required';
  end if;

  insert into public.square_webhook_events(event_id,event_type,merchant_id,order_id,payment_id,invoice_id,status,received_at,updated_at)
  values(p_event_id,p_event_type,p_merchant_id,p_order_id,p_payment_id,p_invoice_id,'processing',v_now,v_now)
  on conflict(event_id) do update set
    event_type=excluded.event_type,
    merchant_id=excluded.merchant_id,
    order_id=excluded.order_id,
    payment_id=excluded.payment_id,
    invoice_id=excluded.invoice_id,
    status=case when public.square_webhook_events.status='processed' then 'processed' else 'processing' end,
    error_text=null,
    updated_at=v_now;

  select * into v_inv from public.invoices where id=p_invoice_id and deleted_at is null for update;
  if not found then
    update public.square_webhook_events set status='failed', error_text='invoice not found', updated_at=v_now where event_id=p_event_id;
    raise exception 'invoice not found';
  end if;

  select elem into v_existing
  from jsonb_array_elements(coalesce(v_inv.payments,'[]'::jsonb)) elem
  where coalesce(elem->>'squarePaymentId', elem->>'externalPaymentId','')=p_payment_id
  limit 1;

  if v_existing is not null then
    update public.square_webhook_events set status='processed', processed_at=coalesce(processed_at,v_now), updated_at=v_now where event_id=p_event_id;
    return jsonb_build_object('ok',true,'already_recorded',true,'invoice_id',p_invoice_id,'payment_id',p_payment_id);
  end if;

  v_payment := jsonb_build_object(
    'id','sq_'||p_payment_id,
    'amount',p_applied_amount,
    'appliedAmount',p_applied_amount,
    'cardFee',p_card_fee,
    'chargedAmount',p_charged_amount,
    'method','Square Card',
    'date',to_char(coalesce(p_paid_at,v_now),'YYYY-MM-DD'),
    'paidAt',coalesce(p_paid_at,v_now),
    'type','payment',
    'status','completed',
    'externalProvider','square',
    'squarePaymentId',p_payment_id,
    'squareOrderId',p_order_id,
    'squareReceiptUrl',p_receipt_url,
    'cardBrand',p_card_brand,
    'last4',p_last4
  );
  v_payments := coalesce(v_inv.payments,'[]'::jsonb) || jsonb_build_array(v_payment);
  v_app := coalesce(v_inv.app_data,'{}'::jsonb) || jsonb_build_object(
    'squareSyncStatus','paid',
    'squarePaidAt',coalesce(p_paid_at,v_now),
    'squarePaymentId',p_payment_id,
    'squareOrderId',p_order_id,
    'squareReceiptUrl',p_receipt_url,
    'receiptDeliveryStatus',coalesce(v_inv.app_data->>'receiptDeliveryStatus','pending_manual_send'),
    'receiptDeliveryUpdatedAt',v_now,
    'squareLastWebhookEventId',p_event_id
  );

  update public.invoices set payments=v_payments, app_data=v_app where id=p_invoice_id;

  insert into public.audit_log(id,action,summary,entity_type,entity_id,related_type,related_id,source,priority,read)
  values('audit_sq_webhook_'||replace(gen_random_uuid()::text,'-',''),'payment_recorded',
         'Square payment recorded for '||coalesce(v_inv.number,p_invoice_id),'invoices',p_invoice_id,
         'square_payment',p_payment_id,'system','normal',false);

  update public.square_webhook_events set status='processed', processed_at=v_now, updated_at=v_now where event_id=p_event_id;
  return jsonb_build_object('ok',true,'already_recorded',false,'invoice_id',p_invoice_id,'payment_id',p_payment_id,'receipt_ready',true,'receipt_delivery_status',v_app->>'receiptDeliveryStatus');
exception when others then
  update public.square_webhook_events set status='failed', error_text=left(sqlerrm,500), updated_at=now() where event_id=p_event_id;
  raise;
end;
$function$
;
-- The verified-payment recorder is service-only. Preserve the caller role so
-- invoice metadata guards recognize the trusted webhook service.
alter function public.record_square_payment_from_webhook(text,text,text,text,text,text,timestamptz,numeric,numeric,numeric,text,text,text) security invoker;
alter function public.record_square_payment_from_webhook(text,text,text,text,text,text,timestamptz,numeric,numeric,numeric,text,text,text) set search_path='';
revoke all on function public.record_square_payment_from_webhook(text,text,text,text,text,text,timestamptz,numeric,numeric,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.record_square_payment_from_webhook(text,text,text,text,text,text,timestamptz,numeric,numeric,numeric,text,text,text) to service_role;
