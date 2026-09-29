begin;
create temporary table wa_linked_test_results(name text,passed boolean check(passed));
create temporary table wa_linked_fixture(k text primary key,v uuid);
grant all on wa_linked_test_results,wa_linked_fixture to service_role,authenticated,anon;
insert into wa_linked_fixture values('actor',(select auth_user_id from public.team where role='owner' and status='active' limit 1)),('worker_a',gen_random_uuid()),('worker_b',gen_random_uuid()),('job_a',gen_random_uuid()),('job_b',gen_random_uuid());
insert into wa_linked_test_results select 'Data API roles cannot read QR, messages or sends',not exists(select 1 from (values('anon'),('authenticated')) r(role) cross join (values('wa_linked_status'),('wa_linked_events'),('wa_linked_sends')) t(tab) where has_table_privilege(r.role,'public.'||t.tab,'SELECT'));
insert into wa_linked_test_results select 'Data API roles cannot queue messages',not has_table_privilege('authenticated','public.wa_linked_sends','INSERT');
insert into wa_linked_test_results select 'queue claim is service-only',not has_function_privilege('authenticated','public.service_claim_wa_linked_send(uuid)','EXECUTE') and not has_function_privilege('anon','public.service_claim_wa_linked_send(uuid)','EXECUTE');
insert into wa_linked_test_results select 'all relay tables have RLS',bool_and(relrowsecurity) from pg_class where oid in ('public.wa_linked_status'::regclass,'public.wa_linked_events'::regclass,'public.wa_linked_sends'::regclass);
set local role service_role;
insert into public.wa_linked_sends(id,created_by,to_phone,body,created_at) select (select v from wa_linked_fixture where k='job_a'),v,'+12025550123','Synthetic rollback only',now()-interval '2 seconds' from wa_linked_fixture where k='actor';
insert into public.wa_linked_sends(id,created_by,to_phone,body) select (select v from wa_linked_fixture where k='job_b'),v,'+12025550124','Synthetic rollback only' from wa_linked_fixture where k='actor';
do $$declare a jsonb;b jsonb;again jsonb;begin
 a:=public.service_claim_wa_linked_send((select v from wa_linked_fixture where k='worker_a'));
 insert into wa_linked_test_results values('first worker atomically claims oldest command',a->>'request_id'=(select v::text from wa_linked_fixture where k='job_a'));
 again:=public.service_claim_wa_linked_send((select v from wa_linked_fixture where k='worker_a'));
 insert into wa_linked_test_results values('same worker recovers same request ID',again->>'request_id'=a->>'request_id');
 b:=public.service_claim_wa_linked_send((select v from wa_linked_fixture where k='worker_b'));
 insert into wa_linked_test_results values('another worker cannot steal in-progress send',b->>'request_id'=(select v::text from wa_linked_fixture where k='job_b'));
 update public.wa_linked_sends set state='submitted' where id=(a->>'request_id')::uuid;
 insert into wa_linked_test_results values('submitted sends are never automatically reclaimed',public.service_claim_wa_linked_send((select v from wa_linked_fixture where k='worker_a')) is null);
 begin
  insert into public.wa_linked_sends select * from public.wa_linked_sends where id=(a->>'request_id')::uuid;
  raise exception 'Duplicate accepted';
 exception when unique_violation then insert into wa_linked_test_results values('database prevents duplicate request ID',true);end;
end$$;
reset role;
select jsonb_build_object('passed',count(*),'tests',jsonb_agg(name)) from wa_linked_test_results;
rollback;
