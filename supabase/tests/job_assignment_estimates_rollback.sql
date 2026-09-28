begin;
create temporary table assignment_fixture(key text primary key,value text);
create temporary table assignment_results(test text primary key,passed boolean not null check(passed));
grant all on assignment_fixture,assignment_results to authenticated;
insert into assignment_fixture values('owner_uid',(select auth_user_id::text from public.team where role='owner' and status='active' limit 1));
insert into assignment_fixture select k,'qa_'||gen_random_uuid()::text from unnest(array['tech','other','lead','estimate','option','manual']) k;
insert into assignment_fixture select k,gen_random_uuid()::text from unnest(array['tech_uid','other_uid']) k;
insert into auth.users(id,email) select value::uuid,'qa-'||value||'@example.invalid' from assignment_fixture where key in ('tech_uid','other_uid');
insert into public.team(id,name,role,status,auth_user_id) values
 ((select value from assignment_fixture where key='tech'),'QA Assignment Tech','technician','active',(select value::uuid from assignment_fixture where key='tech_uid')),
 ((select value from assignment_fixture where key='other'),'QA Replacement Tech','technician','active',(select value::uuid from assignment_fixture where key='other_uid'));
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from assignment_fixture where key='owner_uid'),'role','authenticated')::text,true);
set local role authenticated;
insert into public.leads(id,name,phone,address,service_requested,app_data) values((select value from assignment_fixture where key='lead'),'QA Customer','+12025550148','10 Example Street','Spring repair','{"zip":"01757"}');
do $$declare r jsonb;begin
 r:=public.approve_lead_for_dispatch((select value from assignment_fixture where key='lead'));
 insert into assignment_fixture values('job',r->>'job_id'),('customer',r->>'customer_id');
 begin insert into public.estimates(id,customer_id,converted_job_id) values((select value from assignment_fixture where key='estimate'),r->>'customer_id',r->>'job_id');raise exception 'TEST_FAILED unassigned estimate';exception when others then if sqlerrm not like '%Assign a technician%' then raise;end if;end;
 insert into assignment_results values('unassigned job cannot create estimate',true);
 begin insert into public.estimates(id) values('qa_standalone');raise exception 'TEST_FAILED standalone estimate';exception when others then if sqlerrm not like '%Assign a technician%' then raise;end if;end;
 insert into assignment_results values('standalone estimate cannot bypass assignment',true);
 r:=public.offer_job_technician((select value from assignment_fixture where key='job'),(select value from assignment_fixture where key='tech'),null);
 insert into assignment_fixture values('offer',r->>'id');
 insert into assignment_results values('job form creates five minute offer',(r->>'expires_at')::timestamptz-(r->>'created_at')::timestamptz=interval '5 minutes');
 insert into assignment_results values('retry reuses pending offer',public.offer_job_technician((select value from assignment_fixture where key='job'),(select value from assignment_fixture where key='tech'),null)->>'id'=r->>'id');
 insert into assignment_results select 'pending offer does not assign technician',technician_id is null from public.jobs where id=(select value from assignment_fixture where key='job');
end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from assignment_fixture where key='tech_uid'),'role','authenticated')::text,true);
do $$begin
 begin perform public.offer_job_technician((select value from assignment_fixture where key='job'),(select value from assignment_fixture where key='other'),null);raise exception 'TEST_FAILED technician dispatch';exception when others then if sqlerrm not like '%Office access required%' then raise;end if;end;
 insert into assignment_results values('technician cannot dispatch',true);
 insert into assignment_results values('technician acceptance assigns job',public.respond_lead_offer((select value::uuid from assignment_fixture where key='offer'),true)->>'status'='accepted');
end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from assignment_fixture where key='owner_uid'),'role','authenticated')::text,true);
insert into public.estimates(id,customer_id,converted_job_id) values((select value from assignment_fixture where key='estimate'),(select value from assignment_fixture where key='customer'),(select value from assignment_fixture where key='job'));
insert into assignment_results select 'estimate linked atomically',estimate_id=(select value from assignment_fixture where key='estimate') from public.jobs where id=(select value from assignment_fixture where key='job');
insert into public.estimates(id,customer_id,converted_job_id) values((select value from assignment_fixture where key='option'),(select value from assignment_fixture where key='customer'),(select value from assignment_fixture where key='job'));
insert into assignment_results select 'additional option keeps original job estimate',estimate_id=(select value from assignment_fixture where key='estimate') from public.jobs where id=(select value from assignment_fixture where key='job');
do $$declare r jsonb;begin
 begin insert into public.estimates(id,converted_job_id) values('qa_wrong_customer',(select value from assignment_fixture where key='job'));raise exception 'TEST_FAILED mismatch';exception when others then if sqlerrm not like '%customer must match%' then raise;end if;end;
 insert into assignment_results values('estimate customer must match job',true);
 begin perform public.offer_job_technician((select value from assignment_fixture where key='job'),(select value from assignment_fixture where key='other'),null);raise exception 'TEST_FAILED stale assignment';exception when others then if sqlerrm not like '%Assignment changed%' then raise;end if;end;
 insert into assignment_results values('stale forms cannot replace newer assignment',true);
 r:=public.offer_job_technician((select value from assignment_fixture where key='job'),(select value from assignment_fixture where key='other'),(select value from assignment_fixture where key='tech'));
 update assignment_fixture set value=r->>'id' where key='offer';
 insert into assignment_results select 'reassignment releases old technician pending acceptance',technician_id is null from public.jobs where id=(select value from assignment_fixture where key='job');
 -- Historical documents stay editable while a replacement is pending.
 update public.estimates set notes='QA historical edit' where id=(select value from assignment_fixture where key='estimate');
 insert into assignment_results values('existing estimates remain editable',true);
 begin perform public.remove_team_member(public.current_team_id());raise exception 'TEST_FAILED owner removal';exception when others then if sqlerrm not like '%Owner accounts%' then raise;end if;end;
 insert into assignment_results values('owner cannot remove own account',true);
 perform public.remove_team_member((select value from assignment_fixture where key='other'));
 insert into assignment_results select 'removed user archived and inactive',status='inactive' and app_data->>'archivedAt' is not null from public.team where id=(select value from assignment_fixture where key='other');
end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from assignment_fixture where key='other_uid'),'role','authenticated')::text,true);
insert into assignment_results values('existing JWT immediately loses CRM access',public.current_app_role() is null and not exists(select 1 from public.jobs));
do $$begin
 begin perform public.respond_lead_offer((select value::uuid from assignment_fixture where key='offer'),true);raise exception 'TEST_FAILED removed accept';exception when others then if sqlerrm not like '%not available%' and sqlerrm not like '%Technician access%' and sqlerrm not like '%Sign in required%' then raise;end if;end;
 insert into assignment_results values('removed technician cannot accept pending offer',true);
end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select value from assignment_fixture where key='owner_uid'),'role','authenticated')::text,true);
insert into public.jobs(id,title,customer_id,technician_id,technician) values((select value from assignment_fixture where key='manual'),'QA Manual',(select value from assignment_fixture where key='customer'),(select value from assignment_fixture where key='tech'),'QA Assignment Tech');
insert into assignment_results select 'manual job assignment persists',technician_id=(select value from assignment_fixture where key='tech') from public.jobs where id=(select value from assignment_fixture where key='manual');
reset role;
select jsonb_build_object('passed',count(*),'tests',jsonb_agg(test)) from assignment_results;
rollback;
