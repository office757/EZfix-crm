-- Reproduce a website lead whose full address contains ZIP but app_data does not.
-- Everything, including synthetic identities and offer tokens, is rolled back.
begin;
create temporary table approval_zip_results(test text primary key,passed boolean not null check(passed));
create temporary table approval_zip_fixture(key text primary key,value text);
grant all on approval_zip_results,approval_zip_fixture to authenticated,service_role;
insert into approval_zip_fixture values
 ('owner_uid',(select auth_user_id::text from public.team where role='owner' and status='active' limit 1)),
 ('lead','qa_approval_zip_'||gen_random_uuid()),
 ('tech','qa_approval_zip_tech_'||gen_random_uuid()),
 ('tech_uid',gen_random_uuid()::text);
insert into auth.users(id,email) select value::uuid,'qa-approval-zip-'||value||'@example.invalid' from approval_zip_fixture where key='tech_uid';
insert into public.team(id,name,email,role,status,auth_user_id) values
 ((select value from approval_zip_fixture where key='tech'),'QA approval ZIP technician','qa-approval-zip@example.invalid','technician','active',(select value::uuid from approval_zip_fixture where key='tech_uid'));
set local role service_role;
insert into public.leads(id,name,phone,address,source,source_channel,status,service_requested,app_data)
 values((select value from approval_zip_fixture where key='lead'),'QA approval ZIP customer','+12025550149','12 Example St, Example MA 01770','Website','Website Form','new','Garage Door Repair',jsonb_build_object('preferred_date',(current_date+1)::text,'preferred_time','2:00 PM - 4:00 PM'));
insert into approval_zip_fixture values('job',public.service_ensure_website_appointment((select value from approval_zip_fixture where key='lead')));
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from approval_zip_fixture where key='owner_uid'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare r jsonb;offer jsonb;lid text:=(select value from approval_zip_fixture where key='lead');begin
 begin
  perform public.approve_lead_for_dispatch(lid);
  raise exception 'TEST_FAILED missing structured ZIP accepted';
 exception when others then
  if sqlerrm<>'Review the customer name, phone, address and ZIP before approving' then raise;end if;
 end;
 insert into approval_zip_results values('original missing ZIP failure reproduced',true);
 update public.leads set app_data=app_data||jsonb_build_object('zip','01770') where id=lid;
 r:=public.approve_lead_for_dispatch(lid);
 insert into approval_zip_results values('existing website appointment reused',r->>'job_id'=(select value from approval_zip_fixture where key='job'));
 insert into approval_zip_results select 'appointment date and time preserved',scheduled_date=current_date+1 and appointment_window='2:00 PM - 4:00 PM' from public.jobs where id=r->>'job_id';
 insert into approval_zip_results select 'ZIP leading zero and source date preserved',app_data->>'zip'='01770' and app_data->>'preferred_date'=(current_date+1)::text from public.leads where id=lid;
 offer:=public.create_lead_offer(lid,(select value from approval_zip_fixture where key='tech'));
 insert into approval_zip_results values('offer created with corrected ZIP',offer->>'zip'='01770' and offer->>'status'='pending');
 insert into approval_zip_results select 'technician not assigned before acceptance',assigned_technician_id is null from public.leads where id=lid;
 insert into approval_zip_results select 'exactly one offer created',count(*)=1 from public.lead_offers where lead_id=lid;
end$$;
reset role;
select jsonb_build_object('passed',count(*),'tests',jsonb_agg(test order by test)) from approval_zip_results;
rollback;
