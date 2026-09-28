begin;
create temporary table routing_results(test text,passed boolean not null);
create temporary table routing_fixture(key text primary key,value text);
grant all on routing_results,routing_fixture to authenticated,service_role;
insert into routing_fixture values('owner_uid',(select auth_user_id::text from public.team where role='owner' and status='active' limit 1)),('tech_uid',gen_random_uuid()::text),('tech','qa_route_'||gen_random_uuid()::text),('lead','qa_lead_'||gen_random_uuid()::text);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from routing_fixture where key='owner_uid'),'role','authenticated')::text,true);
insert into auth.users(id,email) select value::uuid,'qa-route-'||value||'@example.invalid' from routing_fixture where key='tech_uid';
insert into public.team(id,name,email,role,status,auth_user_id) values((select value from routing_fixture where key='tech'),'QA Route Technician','qa-route@example.invalid','technician','active',(select value::uuid from routing_fixture where key='tech_uid'));
insert into public.technician_dispatch_profiles(technician_id,profile) values((select value from routing_fixture where key='tech'),jsonb_build_object('enabled',true,'dailyLimit',5,'hourlyCost',20,'commissionPercent',30,'shifts',jsonb_build_object(extract(dow from current_date+1)::int::text,jsonb_build_array(420,1200)),'travelMinutesByZip','{"01757":20}'::jsonb,'specialties','{"spring":{"skill":5,"closeRate":80,"averageTicket":600,"materialCost":100,"durationMinutes":60}}'::jsonb));
insert into public.leads(id,name,phone,address,service_requested,source,app_data) values((select value from routing_fixture where key='lead'),'QA Routing Customer','+12025550148','20 Example Street','Spring repair','AI Receptionist','{"zip":"01757"}');
update public.dispatch_policy set mode='automatic',enabled_since=now()-interval '1 hour',config='{"minScore":55,"maxAttempts":3,"timezone":"America/New_York"}';
update public.ai_manager_settings set paused=false where id='main';
insert into routing_fixture select 'decision',jsonb_build_object('zip','01757','type','spring','slot',jsonb_build_object('date',(current_date+1)::text,'start',480,'end',1080),'winner',jsonb_build_object('technician_id',(select value from routing_fixture where key='tech'),'profileVersion',(select updated_at from technician_dispatch_profiles where technician_id=(select value from routing_fixture where key='tech')),'eligible',true,'score',85,'expectedProfit',200,'slot',jsonb_build_object('date',(current_date+1)::text,'start',540,'end',600)))::text;
set local role service_role;
do $$declare r jsonb;begin
 r:=public.service_commit_routing_offer((select value from routing_fixture where key='lead'),(select value from routing_fixture where key='tech'),(select value::jsonb from routing_fixture where key='decision'),(select updated_at from dispatch_policy),(select updated_at from technician_dispatch_profiles where technician_id=(select value from routing_fixture where key='tech')),(select updated_at from leads where id=(select value from routing_fixture where key='lead')),null);
 insert into routing_fixture values('offer',r->>'id');
 insert into routing_results values('automatic offer created without assignment',r->>'status'='pending' and not exists(select 1 from jobs where id=(select converted_job_id from leads where id=(select value from routing_fixture where key='lead')) and technician_id is not null));
 insert into routing_results select 'original service window retained',app_data->'routing_request'->>'end'='1080' from leads where id=(select value from routing_fixture where key='lead');
end$$;
reset role;
-- A new manual booking appears during the five-minute response window.
insert into public.jobs(id,title,technician_id,technician,status,scheduled_date,appointment_window) values('qa_conflict_'||gen_random_uuid()::text,'QA intervening job',(select value from routing_fixture where key='tech'),'QA Route Technician','scheduled',current_date+1,'9 AM - 10 AM');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from routing_fixture where key='tech_uid'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare r jsonb;begin
 r:=public.respond_lead_offer((select value::uuid from routing_fixture where key='offer'),true);
 insert into routing_results values('changed schedule cancels stale automatic offer',r->>'status'='cancelled');
 insert into routing_results values('cancelled offer reveals no job',not(r?'job_id'));
 insert into routing_results values('technician cannot read business scoring',not exists(select 1 from public.dispatch_decisions));
 insert into routing_results values('technician cannot read other routing profiles',not exists(select 1 from public.technician_dispatch_profiles));
 begin perform public.service_commit_routing_offer('x','x','{}',now(),now(),now(),null);raise exception 'TEST_FAILED client routing commit';exception when insufficient_privilege then null;end;
 insert into routing_results values('routing commitment restricted to server',true);
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from routing_fixture where key='owner_uid'),'role','authenticated')::text,true);
-- Make a second lead and reserve it against the new schedule stamp.
update routing_fixture set value='qa_second_'||gen_random_uuid()::text where key='lead';
insert into public.leads(id,name,phone,address,service_requested,source,app_data) values((select value from routing_fixture where key='lead'),'QA Second Customer','+12025550149','21 Example Street','Spring repair','AI Receptionist','{"zip":"01757"}');
set local role service_role;
do $$declare r jsonb;begin
 r:=public.service_commit_routing_offer((select value from routing_fixture where key='lead'),(select value from routing_fixture where key='tech'),(select value::jsonb from routing_fixture where key='decision'),(select updated_at from dispatch_policy),(select updated_at from technician_dispatch_profiles where technician_id=(select value from routing_fixture where key='tech')),(select updated_at from leads where id=(select value from routing_fixture where key='lead')),(select max(updated_at) from jobs where technician_id=(select value from routing_fixture where key='tech')));
 update routing_fixture set value=r->>'id' where key='offer';
end$$;
reset role;
update public.ai_manager_settings set paused=true where id='main';
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from routing_fixture where key='tech_uid'),'role','authenticated')::text,true);
set local role authenticated;
insert into routing_results values('owner pause cancels unaccepted automatic reservation',public.respond_lead_offer((select value::uuid from routing_fixture where key='offer'),true)->>'status'='cancelled');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from routing_fixture where key='owner_uid'),'role','authenticated')::text,true);
update public.ai_manager_settings set paused=false where id='main';
update routing_fixture set value='qa_third_'||gen_random_uuid()::text where key='lead';
update routing_fixture set value=jsonb_set(value::jsonb,'{winner,slot}',jsonb_build_object('date',(current_date+1)::text,'start',720,'end',780))::text where key='decision';
insert into public.leads(id,name,phone,address,service_requested,source,app_data) values((select value from routing_fixture where key='lead'),'QA Third Customer','+12025550146','22 Example Street','Spring repair','AI Receptionist','{"zip":"01757"}');
set local role service_role;
do $$declare r jsonb;begin
 r:=public.service_commit_routing_offer((select value from routing_fixture where key='lead'),(select value from routing_fixture where key='tech'),(select value::jsonb from routing_fixture where key='decision'),(select updated_at from dispatch_policy),(select updated_at from technician_dispatch_profiles where technician_id=(select value from routing_fixture where key='tech')),(select updated_at from leads where id=(select value from routing_fixture where key='lead')),(select max(updated_at) from jobs where technician_id=(select value from routing_fixture where key='tech')));
 update routing_fixture set value=r->>'id' where key='offer';
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from routing_fixture where key='tech_uid'),'role','authenticated')::text,true);
set local role authenticated;
insert into routing_results values('unchanged automatic reservation accepts and reveals job',public.respond_lead_offer((select value::uuid from routing_fixture where key='offer'),true)->>'status'='accepted');
reset role;
do $$begin if exists(select 1 from routing_results where not passed) then raise exception 'Routing revalidation test failed';end if;end$$;
select jsonb_build_object('passed',count(*),'failed',count(*) filter(where not passed),'tests',jsonb_agg(test)) from routing_results;
rollback;
