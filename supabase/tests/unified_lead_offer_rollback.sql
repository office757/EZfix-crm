begin;
do $$
declare uid uuid:=gen_random_uuid();other_uid uuid:=gen_random_uuid();owner_uid uuid;tid text:='qa_multi_'||gen_random_uuid();other_tid text:='qa_other_'||gen_random_uuid();lid text;jid text;offer jsonb;r jsonb;again jsonb;sid text;wid text;channel text;n integer:=0;
begin
 select auth_user_id into owner_uid from public.team where role='owner' and status='active' limit 1;
 insert into auth.users(id,email) values(uid,uid||'@example.invalid'),(other_uid,other_uid||'@example.invalid');
 insert into public.team(id,name,email,role,status,auth_user_id) values(tid,'QA Multi Channel',uid||'@example.invalid','technician','active',uid),(other_tid,'QA Other',other_uid||'@example.invalid','technician','active',other_uid);
 foreach channel in array array['in_app','sms','whatsapp','decline','expired','inactive'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_uid,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  lid:='qa_multichannel_'||gen_random_uuid();
  insert into public.leads(id,name,phone,address,service_requested,source,app_data) values(lid,'QA Multi Customer','+12025550149','12 QA Street','Spring repair','QA','{"zip":"01757","preferred_appointment":"2026-10-01","preferred_time":"08:00–12:00"}');
  r:=public.approve_lead_for_dispatch(lid);jid:=r->>'job_id';offer:=public.create_lead_offer(lid,tid);
  execute 'reset role';
  execute 'set local role service_role';
  if not public.service_claim_offer_notification((offer->>'id')::uuid) then raise exception 'FAIL notification claim';end if;
  if public.service_claim_offer_notification((offer->>'id')::uuid) then raise exception 'FAIL duplicate claim';end if;n:=n+2;
  sid:=md5(offer->>'id')||md5((offer->>'id')||'sms');wid:=md5((offer->>'id')||'wa')||md5((offer->>'id')||'wa2');
  if not public.service_issue_lead_offer_tokens((offer->>'id')::uuid,sid,wid) then raise exception 'FAIL token issuance';end if;
  if public.service_issue_lead_offer_tokens((offer->>'id')::uuid,sid,wid) then raise exception 'FAIL token replacement';end if;n:=n+2;
  r:=public.service_lead_offer_link(sid,null);
  if r->>'status'<>'pending' or r ? 'job_id' or r ? 'technician_id' or r ? 'lead_id' or r ? 'address' then raise exception 'FAIL link privacy';end if;
  if public.service_lead_offer_link(repeat('f',64),null) is not null then raise exception 'FAIL invalid token';end if;n:=n+2;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.service_lead_offer_link(sid,true);raise exception 'FAIL anon RPC accepted';exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_uid,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin perform public.service_lead_offer_link(sid,true);raise exception 'FAIL authenticated service RPC';exception when insufficient_privilege then null;end;
  begin perform public.respond_lead_offer((offer->>'id')::uuid,true);raise exception 'FAIL other technician';exception when others then if sqlerrm not like '%Offer not available%' then raise;end if;end;n:=n+3;
  execute 'reset role';
  if channel='expired' then update public.lead_offers set expires_at=clock_timestamp()-interval '1 second' where id=(offer->>'id')::uuid;end if;
  if channel='inactive' then perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_uid,'role','authenticated')::text,true);update public.team set status='inactive' where id=tid;end if;
  if channel='in_app' then
   perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);execute 'set local role authenticated';
   r:=public.respond_lead_offer((offer->>'id')::uuid,true);
  else
   execute 'set local role service_role';
   r:=public.service_lead_offer_link(case when channel='whatsapp' then wid else sid end,channel<>'decline');
  end if;
  execute 'reset role';
  if channel in ('in_app','sms','whatsapp') then
   if r->>'status'<>'accepted' or r->>'responded_channel'<>channel then raise exception 'FAIL winning channel';end if;
   if not exists(select 1 from public.jobs where id=jid and technician_id=tid) or not exists(select 1 from public.leads where id=lid and assigned_technician_id=tid) then raise exception 'FAIL atomic assignment';end if;n:=n+2;
   execute 'set local role service_role';again:=public.service_lead_offer_link(wid,false);execute 'reset role';
   if again->>'status'<>'accepted' or again->>'responded_channel'<>channel then raise exception 'FAIL second channel reversed acceptance';end if;
   perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);execute 'set local role authenticated';
   again:=public.respond_lead_offer((offer->>'id')::uuid,true);execute 'reset role';
   if again->>'status'<>'accepted' or again->>'responded_channel'<>channel then raise exception 'FAIL repeat app acceptance';end if;
   if (select count(*) from public.audit_log where action='lead_offer_accepted' and entity_id=jid)<>1 then raise exception 'FAIL duplicate audit';end if;n:=n+3;
  elsif channel='decline' then
   execute 'set local role service_role';again:=public.service_lead_offer_link(wid,true);execute 'reset role';
   if r->>'status'<>'declined' or again->>'status'<>'declined' then raise exception 'FAIL reversed decline';end if;n:=n+1;
  elsif channel='expired' then if r->>'status'<>'expired' then raise exception 'FAIL accepted expired offer';end if;n:=n+1;
  elsif channel='inactive' then if r is not null then raise exception 'FAIL disabled technician token';end if;n:=n+1;end if;
 end loop;
 perform set_config('ezfix.test_result',jsonb_build_object('checks',n,'status','PASS','live_messages_sent',0)::text,true);
end;$$;
select current_setting('ezfix.test_result') as result;
rollback;
