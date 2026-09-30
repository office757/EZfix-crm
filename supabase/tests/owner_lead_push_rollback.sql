begin;
create temp table push_fixture(key text primary key,value text);
insert into push_fixture values
 ('owner',(select id from public.team where role='owner' and status='active' and auth_user_id is not null limit 1)),
 ('tech',(select id from public.team where role='technician' and status='active' and auth_user_id is not null limit 1)),
 ('owner_sub',gen_random_uuid()::text),('tech_sub',gen_random_uuid()::text),('lead',gen_random_uuid()::text),('demo',gen_random_uuid()::text),('skipped',gen_random_uuid()::text);
insert into public.push_subscriptions(id,team_id,endpoint,subscription)
 select (select value::uuid from push_fixture where key=k||'_sub'),(select value from push_fixture where key=k),
 'https://web.push.apple.com/qa-'||(select value from push_fixture where key=k||'_sub'),
 jsonb_build_object('endpoint','https://web.push.apple.com/qa-'||(select value from push_fixture where key=k||'_sub')) from unnest(array['owner','tech']) k;
insert into public.leads(id,name,source,app_data) values
 ((select value from push_fixture where key='lead'),'QA Push Rollback','Phone Call','{}'),
 ((select value from push_fixture where key='demo'),'QA Push Demo','Demo','{"is_demo":true}');
do $$declare n integer;begin
 select count(*) into n from public.owner_lead_push_queue where lead_id=(select value from push_fixture where key='lead');
 if n<>1 then raise exception 'Owner-only recipient test failed: %',n;end if;
 if exists(select 1 from public.owner_lead_push_queue where lead_id=(select value from push_fixture where key='demo')) then raise exception 'Demo exclusion failed';end if;
 if not exists(select 1 from public.owner_lead_push_queue where lead_id=(select value from push_fixture where key='lead') and team_id=(select value from push_fixture where key='owner')) then raise exception 'Wrong recipient';end if;
 if has_table_privilege('authenticated','public.owner_lead_push_queue','SELECT') or has_table_privilege('authenticated','public.owner_lead_push_queue','INSERT') or has_table_privilege('anon','public.owner_lead_push_queue','SELECT') then raise exception 'Client queue access not restricted';end if;
 if has_function_privilege('authenticated','public.service_claim_owner_lead_push()','EXECUTE') or has_function_privilege('anon','public.service_claim_owner_lead_push()','EXECUTE') then raise exception 'Client claim access not restricted';end if;
 if has_function_privilege('authenticated','private.queue_owner_lead_push()','EXECUTE') then raise exception 'Trigger callable by clients';end if;
 if not (select relrowsecurity from pg_class where oid='public.owner_lead_push_queue'::regclass) then raise exception 'Missing RLS';end if;
end;$$;
-- Claims run as the real server role, not as database owner.
set local role service_role;
create temp table claimed_push as select * from public.service_claim_owner_lead_push();
do $$begin
 if (select count(*) from claimed_push)<>1 then raise exception 'Claim failed';end if;
 if exists(select 1 from public.service_claim_owner_lead_push()) then raise exception 'Duplicate claim';end if;
end;$$;
reset role;
update public.owner_lead_push_queue set claimed_at=now()-interval '6 minutes' where lead_id=(select value from push_fixture where key='lead');
select count(*) from public.service_claim_owner_lead_push();
do $$begin
 if not exists(select 1 from public.owner_lead_push_queue where lead_id=(select value from push_fixture where key='lead') and status='unconfirmed') then raise exception 'Stale claim state failed';end if;
end;$$;
insert into public.leads(id,name,source,app_data) values ((select value from push_fixture where key='skipped'),'QA Push Revoked','Phone Call','{}');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select auth_user_id from public.team where id=(select value from push_fixture where key='owner')),'role','authenticated')::text,true);
update public.leads set deleted_at=now() where id=(select value from push_fixture where key='skipped');
select count(*) from public.service_claim_owner_lead_push();
do $$begin
 if not exists(select 1 from public.owner_lead_push_queue where lead_id=(select value from push_fixture where key='skipped') and status='skipped') then raise exception 'Removed lead still eligible';end if;
end;$$;
select 'PASS: owner-only queue, demo exclusion, grants, RLS, atomic claims, duplicate protection, stale handling and removed-lead cancellation' as verification;
rollback;
