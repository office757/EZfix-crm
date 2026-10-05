begin;
set local role service_role;
insert into public.invoices(id,number,items) values('qa_owner_payment_push','QA-PAYMENT-PUSH','[{"qty":1,"rate":100,"taxable":false}]');
update public.invoices set payments='[{"id":"pending","amount":10,"status":"pending"},{"id":"refund","amount":10,"type":"refund"},{"id":"negative","amount":-10},{"id":"malformed","amount":0}]' where id='qa_owner_payment_push';
do $$begin if exists(select 1 from public.owner_payment_events where invoice_id='qa_owner_payment_push') then raise exception 'Nonreceived payment queued';end if;end$$;
update public.invoices set payments=payments||'[{"id":"manual","amount":25,"type":"deposit"}]'::jsonb where id='qa_owner_payment_push';
update public.invoices set payments=payments where id='qa_owner_payment_push';
update public.invoices set customer_name='Updated customer' where id='qa_owner_payment_push';
update public.invoices set payments=jsonb_set(payments,'{4,amount}','26') where id='qa_owner_payment_push';
do $$declare expected integer;begin
 select count(*) into expected from public.push_subscriptions s join public.team t on t.id=s.team_id where t.role='owner' and t.status='active' and t.auth_user_id is not null;
 if (select count(*) from public.owner_payment_events where invoice_id='qa_owner_payment_push')<>1 then raise exception 'Edit/replay duplicated event';end if;
 if (select count(*) from public.owner_payment_push_queue q join public.owner_payment_events e on e.id=q.event_id where e.invoice_id='qa_owner_payment_push')<>expected then raise exception 'Owner-only per-device queue mismatch';end if;
end$$;
-- Pending to confirmed is one newly received payment; Square replay stays one.
update public.invoices set payments=jsonb_set(payments,'{0,status}','"completed"') where id='qa_owner_payment_push';
select public.record_square_payment_from_webhook('qa_payment_evt_1','payment.updated','qa_merchant','qa_owner_payment_push','qa_owner_payment','qa_order',now(),10,0,10,null,null,null);
select public.record_square_payment_from_webhook('qa_payment_evt_2','payment.updated','qa_merchant','qa_owner_payment_push','qa_owner_payment','qa_order',now(),10,0,10,null,null,null);
do $$begin
 if private.is_received_owner_payment('{"id":"bad","amount":"bad"}') then raise exception 'Malformed amount accepted';end if;
 if (select count(*) from public.owner_payment_events where invoice_id='qa_owner_payment_push')<>3 then raise exception 'Confirmed/Square event count failed';end if;
 if has_table_privilege('authenticated','public.owner_payment_events','SELECT') or has_table_privilege('authenticated','public.owner_payment_push_queue','INSERT') or has_table_privilege('anon','public.owner_payment_push_queue','SELECT') then raise exception 'Private payment queue exposed';end if;
 if has_function_privilege('authenticated','public.service_claim_owner_payment_push()','EXECUTE') or has_function_privilege('anon','private.queue_owner_payment_push()','EXECUTE') then raise exception 'Payment queue capability exposed';end if;
 if not (select relrowsecurity from pg_class where oid='public.owner_payment_push_queue'::regclass) or not (select relrowsecurity from pg_class where oid='public.owner_payment_events'::regclass) then raise exception 'Payment RLS missing';end if;
end$$;
create temp table payment_claims as select * from public.service_claim_owner_payment_push();
do $$begin
 if (select count(*) from payment_claims where invoice_id='qa_owner_payment_push')<>(select count(*) from public.owner_payment_push_queue q join public.owner_payment_events e on e.id=q.event_id where e.invoice_id='qa_owner_payment_push') then raise exception 'Claim missing';end if;
 if exists(select 1 from public.service_claim_owner_payment_push() where invoice_id='qa_owner_payment_push') then raise exception 'Repeated claim';end if;
end$$;
reset role;
select 'PASS: partial/deposit/manual/Square, pending confirmation, replay/edit deduplication, malformed/refund exclusion, owner devices, service-only claims and RLS; rolled back without sending pushes' as verification;
rollback;
