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
insert into earnings_results values('linked login resolves own ID',public.current_team_id()=(select value from earnings_fixture where key='tech'));
insert into earnings_results values('only own team commission is readable',(select count(*)=1 from public.team) and (select commission_percent=30 from public.team where id=public.current_team_id()));
insert into earnings_results values('same-name teammate is hidden',not exists(select 1 from public.team where id=(select value from earnings_fixture where key='other')));
insert into earnings_results values('renamed own job remains visible',exists(select 1 from public.jobs where id=(select value from earnings_fixture where key='job')));
insert into earnings_results values('other job and customer remain hidden',not exists(select 1 from public.jobs where id=(select value from earnings_fixture where key='other_job')) and not exists(select 1 from public.customers where id=(select value from earnings_fixture where key='other_customer')));
insert into earnings_results values('own linked invoice is readable',exists(select 1 from public.invoices where id=(select value from earnings_fixture where key='invoice')));
insert into earnings_results values('other invoice remains hidden',not exists(select 1 from public.invoices where id=(select value from earnings_fixture where key='other_invoice')));
insert into earnings_results select 'own parts payer and cost readable',material_cost=200 and app_data->>'parts_paid_by'='technician' from public.jobs where id=(select value from earnings_fixture where key='job');
do $$declare affected integer;begin
 begin
  update public.team set commission_percent=90 where id=public.current_team_id();get diagnostics affected=row_count;
  if affected<>0 then raise exception 'TEST_FAILED technician changed commission';end if;
 exception when insufficient_privilege then null;end;
 insert into earnings_results values('technician cannot alter own commission',true);
end$$;
insert into earnings_results values('office activity log not exposed',not exists(select 1 from public.audit_log where entity_id=(select value from earnings_fixture where key='other_job')));
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from earnings_fixture where key='owner_uid'),'role','authenticated')::text,true);
select public.remove_team_member((select value from earnings_fixture where key='tech'));
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from earnings_fixture where key='tech_uid'),'role','authenticated')::text,true);
insert into earnings_results values('archived login loses earnings data immediately',public.current_team_id() is null and not exists(select 1 from public.jobs) and not exists(select 1 from public.invoices));
reset role;
select jsonb_build_object('passed',count(*),'tests',jsonb_agg(test)) as result from earnings_results;
rollback;
