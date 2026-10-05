-- Transactional integration check. Uses active roles, synthetic rows, and rolls back.
begin;
do $$
declare
 owner_uid uuid;tech_uid uuid;office_uid uuid;tech_id text;
 jid text:=gen_random_uuid()::text;lid text:=gen_random_uuid()::text;
 invoice_count bigint;msg text;
begin
 select auth_user_id into owner_uid from public.team where role='owner' and status='active' limit 1;
 select auth_user_id,id into tech_uid,tech_id from public.team where role='technician' and status='active' and auth_user_id is not null limit 1;
 select auth_user_id into office_uid from public.team where role='office' and status='active' and auth_user_id is not null limit 1;
 if owner_uid is null or tech_uid is null then raise exception 'Test roles unavailable';end if;
 select count(*) into invoice_count from public.invoices;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_uid,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',owner_uid::text,true);
 execute 'set local role authenticated';
 if not public.is_owner() then raise exception 'Owner authorization failed';end if;
 insert into public.jobs(id,title,status,workflow_version,technician_id) values(jid,'Transactional owner workflow test','new',1,tech_id);
 update public.jobs set status='arrived' where id=jid;
 update public.jobs set status='work_in_progress' where id=jid;
 update public.jobs set status='work_finished' where id=jid;
 update public.jobs set status='completed' where id=jid;
 if not exists(select 1 from public.jobs where id=jid and status='completed' and app_data->'completion_signature' is null) then raise exception 'Unsigned owner close failed';end if;
 if not exists(select 1 from public.audit_log where entity_id=jid and source='database' and created_by_team_id=public.current_team_id()) then raise exception 'Missing owner audit';end if;
 if (select count(*) from public.invoices)<>invoice_count then raise exception 'Closing changed invoices';end if;
 execute 'reset role';
 insert into public.leads(id,name,status,converted_job_id) values(lid,'Transactional owner lead','converted',jid);
 insert into public.lead_offers(lead_id,technician_id,zip) values(lid,tech_id,'10001');
 execute 'set local role authenticated';
 update public.jobs set technician_id=null where id=jid;
 if exists(select 1 from public.lead_offers where lead_id=lid and status='pending') then raise exception 'Stale offer not cancelled';end if;
 update public.jobs set technician_id=tech_id,status='new' where id=jid;
 if not exists(select 1 from public.leads where id=lid and assigned_technician_id=tech_id) then raise exception 'Linked lead not synchronized';end if;
 perform public.complete_dispatch_job(jid,jsonb_build_object('name','Synthetic signature test','dataUrl','data:image/png;base64,'||repeat('A',120)));
 if not exists(select 1 from public.jobs where id=jid and status='completed' and app_data->'completion_signature' is not null) then raise exception 'Optional owner signature unavailable';end if;
 update public.jobs set status='new' where id=jid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',tech_uid,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',tech_uid::text,true);
 if public.is_owner() then raise exception 'Technician became owner';end if;
 begin
  update public.jobs set status='work_in_progress' where id=jid;
  raise exception 'Technician bypassed photo guard';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'Exterior arrival photo required' then raise exception 'Unexpected technician result: %',msg;end if;
 end;
 begin
  perform public.complete_dispatch_job(jid,jsonb_build_object('name','Synthetic technician','dataUrl','data:image/png;base64,'||repeat('A',120)));
  raise exception 'Technician bypassed payment guard';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'Full payment and confirmed receipt delivery required before closing' then raise exception 'Unexpected technician close result: %',msg;end if;
 end;
 if office_uid is not null then
  perform set_config('request.jwt.claims',jsonb_build_object('sub',office_uid,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',office_uid::text,true);
  if public.is_owner() then raise exception 'Office became owner';end if;
  begin
   update public.jobs set status='work_finished' where id=jid;
   raise exception 'Office bypassed photo guard';
  exception when others then
   get stacked diagnostics msg=message_text;
   if msg<>'Exterior arrival photo required' then raise exception 'Unexpected office result: %',msg;end if;
  end;
 end if;
 execute 'reset role';
end $$;
rollback;
select 'PASS: owner transitions, unsigned closure, audit, unchanged invoices, reassignment cancels offers and synchronizes leads; technician/office gates retained; synthetic rows rolled back' as verification;
