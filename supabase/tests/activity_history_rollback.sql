begin;
create temporary table activity_fixture(key text primary key,value text);
create temporary table activity_results(test text primary key,passed boolean not null check(passed));
grant all on activity_fixture,activity_results to authenticated;
insert into activity_fixture select key,'qa_activity_'||gen_random_uuid()::text from unnest(array['customer','job','invoice','rolled_back']) key;
insert into activity_fixture values('owner_uid',(select auth_user_id::text from public.team where role='owner' and status='active' limit 1));
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from activity_fixture where key='owner_uid'),'role','authenticated')::text,true);
set local role authenticated;
insert into public.customers(id,name) values((select value from activity_fixture where key='customer'),'QA Activity Customer');
insert into public.jobs(id,customer_id,title,material_cost,app_data) values((select value from activity_fixture where key='job'),(select value from activity_fixture where key='customer'),'QA Activity Job',200,'{"parts_paid_by":"technician","provider_token":"QA_HIDDEN_SECRET"}');
insert into activity_results select 'creation has authenticated actor snapshot',created_by_team_id=public.current_team_id() and details->>'actor_name'=(select name from public.team where id=public.current_team_id()) from public.audit_log where entity_id=(select value from activity_fixture where key='job') and source='database' and action='record_created';
update public.jobs set material_cost=250,status='cancelled',cancel_reason='Customer requested another date' where id=(select value from activity_fixture where key='job');
insert into activity_results select 'field changes preserve previous and new values',(details#>>'{before,material_cost}')::numeric=200 and (details#>>'{after,material_cost}')::numeric=250 from public.audit_log where entity_id=(select value from activity_fixture where key='job') and source='database' and action='record_updated';
insert into activity_results select 'recorded reason is retained',details->>'reason'='Customer requested another date' from public.audit_log where entity_id=(select value from activity_fixture where key='job') and source='database' and action='record_updated';
insert into activity_results values('arbitrary app_data is excluded',not exists(select 1 from public.audit_log where entity_id=(select value from activity_fixture where key='job') and details::text like '%QA_HIDDEN_SECRET%'));
insert into activity_results select 'parts payer is captured',details#>>'{after,parts_paid_by}'='technician' from public.audit_log where entity_id=(select value from activity_fixture where key='job') and source='database' and action='record_created';
do $$declare n integer;begin
 select count(*) into n from public.audit_log where entity_id=(select value from activity_fixture where key='job');
 update public.jobs set title=title where id=(select value from activity_fixture where key='job');
 insert into activity_results values('unchanged saves do not create noise',n=(select count(*) from public.audit_log where entity_id=(select value from activity_fixture where key='job')));
end$$;
insert into public.invoices(id,number,customer_id,job_id,items,payments,photos,app_data) values(
 (select value from activity_fixture where key='invoice'),(select 'QA-'||value from activity_fixture where key='invoice'),(select value from activity_fixture where key='customer'),(select value from activity_fixture where key='job'),
 '[{"qty":1,"rate":1000,"taxable":false,"provider_token":"QA_ITEM_SECRET"}]','[{"amount":103.5,"appliedAmount":100,"cardFee":3.5,"method":"Card","provider_token":"QA_PAYMENT_SECRET"}]','[{"url":"QA_PHOTO_SECRET"}]','{"token":"QA_DOCUMENT_SECRET"}');
insert into activity_results select 'invoice amounts and applied payments are retained',details#>>'{after,items,0,rate}'='1000' and details#>>'{after,payments,0,applied_amount}'='100' and details#>>'{after,payments,0,card_fee}'='3.5' from public.audit_log where entity_id=(select value from activity_fixture where key='invoice') and source='database';
insert into activity_results select 'photo count retained without photo URLs',details#>>'{after,photo_count}'='1' and details::text not like '%QA_PHOTO_SECRET%' from public.audit_log where entity_id=(select value from activity_fixture where key='invoice') and source='database';
insert into activity_results values('nested provider and document tokens are excluded',not exists(select 1 from public.audit_log where entity_id=(select value from activity_fixture where key='invoice') and (details::text like '%QA_ITEM_SECRET%' or details::text like '%QA_PAYMENT_SECRET%' or details::text like '%QA_DOCUMENT_SECRET%')));
do $$begin
 begin update public.audit_log set details='{}' where entity_id=(select value from activity_fixture where key='job');raise exception 'TEST_FAILED audit rewrite';exception when insufficient_privilege then null;end;
 insert into activity_results values('client cannot rewrite details',true);
 begin insert into public.audit_log(id,source) values('qa_fake_event','database');raise exception 'TEST_FAILED audit forge';exception when insufficient_privilege then null;end;
 insert into activity_results values('client cannot forge a database event',true);
 begin delete from public.audit_log where entity_id=(select value from activity_fixture where key='job');raise exception 'TEST_FAILED audit deletion';exception when insufficient_privilege then null;end;
 insert into activity_results values('client cannot delete history',true);
 begin
  insert into public.jobs(id,title) values((select value from activity_fixture where key='rolled_back'),'QA Rolled Back');
  raise exception 'QA deliberate rollback';
 exception when raise_exception then if sqlerrm<>'QA deliberate rollback' then raise;end if;end;
 insert into activity_results values('audit change rolls back with its record',not exists(select 1 from public.audit_log where entity_id=(select value from activity_fixture where key='rolled_back')));
end$$;
update public.audit_log set read=true where entity_id=(select value from activity_fixture where key='job');
insert into activity_results values('read acknowledgement still works',not exists(select 1 from public.audit_log where entity_id=(select value from activity_fixture where key='job') and read is not true));
reset role;
insert into activity_results values('audit writer cannot change business data',not has_table_privilege('crm_audit_writer','public.jobs','UPDATE') and not has_table_privilege('crm_audit_writer','public.invoices','UPDATE'));
insert into activity_results values('private trigger is not a client-callable API',not has_function_privilege('authenticated','private.capture_business_change()','EXECUTE') and not has_function_privilege('anon','private.capture_business_change()','EXECUTE'));
select jsonb_build_object('passed',count(*),'tests',jsonb_agg(test)) as result from activity_results;
rollback;
