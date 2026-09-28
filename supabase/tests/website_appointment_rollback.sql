begin;
create temporary table website_results(test text primary key,passed boolean not null check(passed));
grant all on website_results to service_role;
insert into website_results values
 ('anonymous RPC denied',not has_function_privilege('anon','public.service_ensure_website_appointment(text)','execute')),
 ('authenticated RPC denied',not has_function_privilege('authenticated','public.service_ensure_website_appointment(text)','execute')),
 ('anonymous private function denied',not has_function_privilege('anon','private.ensure_website_appointment(text)','execute')),
 ('authenticated private function denied',not has_function_privilege('authenticated','private.ensure_website_appointment(text)','execute'));
set local role service_role;
do $$declare lid text:='qa_website_'||gen_random_uuid();bad text:='qa_website_'||gen_random_uuid();orphan text:='qa_website_'||gen_random_uuid();jid text;old_jid text:='qa_website_job_'||gen_random_uuid();begin
 insert into public.leads(id,name,source,source_channel,status,app_data)
 values(lid,'Synthetic website test','Website','Website Form','new',jsonb_build_object('preferred_date',(current_date+1)::text,'preferred_time','8–10 AM'));
 jid:=public.service_ensure_website_appointment(lid);
 insert into website_results select 'job and lead linked atomically',converted_job_id=jid from public.leads where id=lid;
 insert into website_results select 'unassigned job preserves website source',technician_id is null and customer_id is null and workflow_version=0 and app_data->>'lead_id'=lid and scheduled_date=current_date+1 from public.jobs where id=jid;
 insert into website_results values('retry returns same job',public.service_ensure_website_appointment(lid)=jid);
 insert into website_results select 'retry creates no duplicate',count(*)=1 from public.jobs where app_data->>'lead_id'=lid;
 insert into public.leads(id,name,source,source_channel,status,app_data)
 values(bad,'Synthetic invalid date','Website','Website Form','new','{"preferred_date":"8250-02-26","preferred_time":"8–10 AM"}');
 begin perform public.service_ensure_website_appointment(bad);raise exception 'TEST_FAILED invalid year';exception when others then if sqlerrm not like '%outside supported range%' then raise;end if;end;
 insert into website_results select 'invalid date creates no job',not exists(select 1 from public.jobs where app_data->>'lead_id'=bad);
 insert into website_results select 'invalid date retains unlinked lead',converted_job_id is null from public.leads where id=bad;
 update public.leads set app_data='{"preferred_date":"2026-02-31","preferred_time":"8–10 AM"}' where id=bad;
 begin perform public.service_ensure_website_appointment(bad);raise exception 'TEST_FAILED invalid day';exception when datetime_field_overflow then null;end;
 insert into website_results values('invalid calendar day rejected',true);
 update public.leads set app_data=jsonb_build_object('preferred_date',(current_date+1)::text,'preferred_time','') where id=bad;
 begin perform public.service_ensure_website_appointment(bad);raise exception 'TEST_FAILED missing time';exception when others then if sqlerrm not like '%Appointment time required%' then raise;end if;end;
 insert into website_results values('missing time rejected',true);
 insert into public.leads(id,name,source,source_channel,status) values(orphan,'Synthetic recovery','Website','Website Form','new');
 insert into public.jobs(id,customer_name,title,status,app_data) values(old_jid,'Synthetic recovery','Recovery','new',jsonb_build_object('source','website_form','lead_id',orphan));
 insert into website_results values('previous orphan recovered without new job',public.service_ensure_website_appointment(orphan)=old_jid);
 insert into website_results select 'recovered lead links original job',converted_job_id=old_jid from public.leads where id=orphan;
 begin perform public.service_ensure_website_appointment('missing_synthetic');raise exception 'TEST_FAILED missing lead';exception when others then if sqlerrm not like '%Website lead required%' then raise;end if;end;
 insert into website_results values('missing lead rejected',true);
end$$;
reset role;
select jsonb_build_object('passed',count(*),'tests',jsonb_agg(test order by test)) from website_results;
rollback;
