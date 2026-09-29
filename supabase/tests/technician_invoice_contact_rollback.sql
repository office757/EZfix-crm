begin;
create temporary table earnings_fixture(key text primary key,value text);
create temporary table earnings_results(test text primary key,passed boolean not null check(passed));
grant all on earnings_fixture,earnings_results to authenticated;
insert into earnings_fixture select key,'qa_earnings_'||gen_random_uuid()::text from unnest(array['tech','other','customer','other_customer','job','other_job','invoice','other_invoice']) key;
insert into earnings_fixture select key,gen_random_uuid()::text from unnest(array['tech_uid','other_uid']) key;
insert into earnings_fixture values('owner_uid',(select auth_user_id::text from public.team where role='owner' and status='active' limit 1));
insert into auth.users(id,email) select value::uuid,'qa-earnings-'||value||'@example.invalid' from earnings_fixture where key in ('tech_uid','other_uid');
insert into public.team(id,name,role,status,auth_user_id,commission_percent) values
 ((select value from earnings_fixture where key='tech'),'QA Same Name','technician','active',(select value::uuid from earnings_fixture where key='tech_uid'),30),
 ((select value from earnings_fixture where key='other'),'QA Same Name','technician','active',(select value::uuid from earnings_fixture where key='other_uid'),40);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from earnings_fixture where key='owner_uid'),'role','authenticated')::text,true);
set local role authenticated;
insert into public.customers(id,name) values((select value from earnings_fixture where key='customer'),'QA Earnings Customer'),((select value from earnings_fixture where key='other_customer'),'QA Other Customer');
insert into public.jobs(id,customer_id,technician_id,technician,title,scheduled_date,material_cost,app_data) values
 ((select value from earnings_fixture where key='job'),(select value from earnings_fixture where key='customer'),(select value from earnings_fixture where key='tech'),'Old technician name','QA Earnings','2026-09-29',200,'{"parts_paid_by":"technician"}'),
 ((select value from earnings_fixture where key='other_job'),(select value from earnings_fixture where key='other_customer'),(select value from earnings_fixture where key='other'),'QA Same Name','QA Other Earnings','2026-09-29',900,'{}');
insert into public.invoices(id,number,customer_id,job_id,items) values
 ((select value from earnings_fixture where key='invoice'),(select 'QA-'||value from earnings_fixture where key='invoice'),(select value from earnings_fixture where key='customer'),(select value from earnings_fixture where key='job'),'[{"qty":1,"rate":1000,"taxable":false}]'),
 ((select value from earnings_fixture where key='other_invoice'),(select 'QA-'||value from earnings_fixture where key='other_invoice'),(select value from earnings_fixture where key='other_customer'),(select value from earnings_fixture where key='other_job'),'[{"qty":1,"rate":9000,"taxable":false}]');

select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from earnings_fixture where key='tech_uid'),'role','authenticated')::text,true);
select public.technician_set_invoice_contact(id,'email','qa@example.invalid',row_version) is not null as saved from public.invoices where id=(select value from earnings_fixture where key='invoice');
insert into earnings_results values('invoice email saved',(select customer_email='qa@example.invalid' from public.invoices where id=(select value from earnings_fixture where key='invoice')));
insert into earnings_results values('customer unchanged',(select email is null from public.customers where id=(select value from earnings_fixture where key='customer')));
select public.technician_set_invoice_contact(id,'phone','+12025550123',row_version) is not null as saved from public.invoices where id=(select value from earnings_fixture where key='invoice');
insert into earnings_results values('phone saved without erasing email',(select customer_phone='+12025550123' and customer_email='qa@example.invalid' from public.invoices where id=(select value from earnings_fixture where key='invoice')));
do $$begin
 begin perform public.technician_set_invoice_contact((select value from earnings_fixture where key='other_invoice'),'email','qa@example.invalid',1);raise exception 'TEST_FAILED other invoice allowed';exception when insufficient_privilege then null;end;
 insert into earnings_results values('other invoice denied',true);
 begin perform public.technician_set_invoice_contact((select value from earnings_fixture where key='invoice'),'email','qa@example.invalid',-1);raise exception 'TEST_FAILED stale version allowed';exception when serialization_failure then null;end;
 insert into earnings_results values('stale version denied',true);
 begin perform public.technician_set_invoice_contact((select value from earnings_fixture where key='invoice'),'items','[]',1);raise exception 'TEST_FAILED field allowed';exception when invalid_parameter_value then null;end;
 insert into earnings_results values('financial field denied',true);
 begin perform public.technician_set_invoice_contact((select value from earnings_fixture where key='invoice'),'email','bad',1);raise exception 'TEST_FAILED bad email allowed';exception when invalid_parameter_value then null;end;
 insert into earnings_results values('invalid email denied',true);
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from earnings_fixture where key='owner_uid'),'role','authenticated')::text,true);
update public.team set status='inactive' where id=(select value from earnings_fixture where key='tech');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from earnings_fixture where key='tech_uid'),'role','authenticated')::text,true);
do $$begin
 begin perform public.technician_set_invoice_contact((select value from earnings_fixture where key='invoice'),'email','qa@example.invalid',1);raise exception 'TEST_FAILED revoked technician allowed';exception when insufficient_privilege then null;end;
 insert into earnings_results values('inactive technician denied',true);
end$$;
reset role;
select jsonb_build_object('passed',count(*),'tests',jsonb_agg(test)) from earnings_results;
rollback;
