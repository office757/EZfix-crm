begin;
set local role service_role;
insert into public.invoices(id,number,items) values('qa_square_sync_20260929','QA-SQUARE-SYNC','[{"qty":1,"rate":1,"taxable":false}]');
select public.record_square_payment_from_webhook('qa_sq_evt_20260929','payment.updated','qa_merchant','qa_square_sync_20260929','qa_sq_payment_20260929','qa_order',now(),1,0.04,1.04,null,null,null);
select public.record_square_payment_from_webhook('qa_sq_evt_20260929_repeat','payment.updated','qa_merchant','qa_square_sync_20260929','qa_sq_payment_20260929','qa_order',now(),1,0.04,1.04,null,null,null);
do $$begin
 if not exists(select 1 from public.invoices where id='qa_square_sync_20260929' and jsonb_array_length(payments)=1 and payments->0->>'appliedAmount'='1' and payments->0->>'chargedAmount'='1.04' and app_data->>'squareSyncStatus'='paid') then raise exception 'Payment persistence/idempotency failed';end if;
 if (select count(*) from public.audit_log where entity_id='qa_square_sync_20260929' and action='payment_recorded')<>1 then raise exception 'Duplicate audit';end if;
 if has_function_privilege('anon','public.record_square_payment_from_webhook(text,text,text,text,text,text,timestamptz,numeric,numeric,numeric,text,text,text)','execute') or has_function_privilege('authenticated','public.record_square_payment_from_webhook(text,text,text,text,text,text,timestamptz,numeric,numeric,numeric,text,text,text)','execute') then raise exception 'Client can record payment';end if;
end$$;
select 'PASS payment persistence, amount split, idempotency, single audit and service-only access' as result;
rollback;
