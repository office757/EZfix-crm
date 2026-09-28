-- Check reservations again when a technician accepts, after any schedule or owner-policy change.
grant crm_workflow_executor to postgres;
grant create on schema private to crm_workflow_executor;
grant select on public.ai_manager_settings to crm_workflow_executor;
create policy dispatch_executor_ai_pause on public.ai_manager_settings for select to crm_workflow_executor using(true);
create or replace function private.commit_routing_offer(p_lead_id text,p_technician_id text,p_decision jsonb,p_policy_version timestamptz,p_profile_version timestamptz,p_lead_version timestamptz,p_jobs_stamp timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pol public.dispatch_policy%rowtype;pr public.technician_dispatch_profiles%rowtype;l public.leads%rowtype;o public.lead_offers%rowtype;z text;typ text;sl jsonb;d date;start_min integer;end_min integer;shift jsonb;
begin
 -- Serialize automatic offer reservations; manual assignment is checked again
 -- by the acceptance transaction. No live assignment happens at this stage.
 perform pg_advisory_xact_lock(hashtextextended('ezfix_automatic_dispatch',0));
 select * into pol from public.dispatch_policy where id=true;
 if pol.mode<>'automatic' or pol.updated_at is distinct from p_policy_version or not exists(select 1 from public.ai_manager_settings where id='main' and paused=false) then raise exception 'Routing policy changed';end if;
 select * into l from public.leads where id=p_lead_id and deleted_at is null for update;
 if not found or l.updated_at is distinct from p_lead_version or l.source<>'AI Receptionist' or l.assigned_technician_id is not null or l.status in ('lost','cancelled') then raise exception 'Lead changed or unavailable';end if;
 if l.created_at<pol.enabled_since and not exists(select 1 from public.dispatch_decisions where lead_id=l.id and status='offered') then raise exception 'Historical lead requires office review';end if;
 perform pg_advisory_xact_lock(hashtextextended('ezfix_technician:'||p_technician_id,0));
 select * into pr from public.technician_dispatch_profiles where technician_id=p_technician_id;
 if not found or pr.updated_at is distinct from p_profile_version or (pr.profile->>'enabled')::boolean is not true then raise exception 'Technician profile changed';end if;
 if not exists(select 1 from public.team where id=p_technician_id and role='technician' and status='active' and auth_user_id is not null) then raise exception 'Technician unavailable';end if;
 if (select max(updated_at) from public.jobs where technician_id=p_technician_id and deleted_at is null) is distinct from p_jobs_stamp then raise exception 'Technician schedule changed';end if;
 z:=p_decision->>'zip';typ:=p_decision->>'type';sl:=p_decision->'winner'->'slot';
 d:=(sl->>'date')::date;start_min:=(sl->>'start')::integer;end_min:=(sl->>'end')::integer;
 shift:=pr.profile->'shifts'->extract(dow from d)::integer::text;
 if z is null or z !~ '^[0-9]{5}$' or not(pr.profile->'travelMinutesByZip' ? z) or not(pr.profile->'specialties' ? typ) or shift is null or start_min is null or end_min is null or start_min<(shift->>0)::integer or end_min>(shift->>1)::integer or end_min<=start_min then raise exception 'Invalid routing window or service area';end if;
 if p_decision->'winner'->>'technician_id' is distinct from p_technician_id or coalesce((p_decision->'winner'->>'eligible')::boolean,false) is not true or coalesce((p_decision->'winner'->>'score')::numeric,0)<coalesce((pol.config->>'minScore')::numeric,55) or coalesce((p_decision->'winner'->>'expectedProfit')::numeric,0)<=0 then raise exception 'Business eligibility check failed';end if;
 if d<(clock_timestamp() at time zone coalesce(pol.config->>'timezone','America/New_York'))::date then raise exception 'Requested window has passed';end if;
 update public.lead_offers set status='expired',responded_at=clock_timestamp() where (lead_id=l.id or technician_id=p_technician_id) and status='pending' and expires_at<=clock_timestamp();
 if exists(select 1 from public.lead_offers where (lead_id=l.id or technician_id=p_technician_id) and status='pending') then raise exception 'An offer is already pending';end if;
 if exists(select 1 from public.lead_offers where lead_id=l.id and technician_id=p_technician_id) then raise exception 'Technician already offered this lead';end if;
 if (select count(*) from public.lead_offers where lead_id=l.id)>=coalesce((pol.config->>'maxAttempts')::integer,3) then raise exception 'Offer attempt limit reached';end if;
 if (select count(*) from public.jobs where technician_id=p_technician_id and scheduled_date=d and deleted_at is null and status<>'cancelled')>=coalesce((pr.profile->>'dailyLimit')::integer,1) then raise exception 'Daily capacity reached';end if;
 -- Save the business-approved window as server data, not a free-text booking claim.
 update public.leads set app_data=coalesce(app_data,'{}')||jsonb_build_object('zip',z,'preferred_appointment',d::text,'preferred_time',to_char(time '00:00'+start_min*interval '1 minute','HH24:MI')||'–'||to_char(time '00:00'+end_min*interval '1 minute','HH24:MI'),'routing_type',typ,'routing_slot',sl,'routing_request',coalesce(app_data->'routing_request',p_decision->'slot')) where id=l.id;
 perform private.prepare_auto_dispatch_lead(l.id);
 select * into l from public.leads where id=l.id;
 update public.jobs set app_data=coalesce(app_data,'{}')||jsonb_build_object('routing_type',typ,'routing_slot',sl) where id=l.converted_job_id;
 insert into public.lead_offers(lead_id,technician_id,zip,routing_source) values(l.id,p_technician_id,z,'ashley') returning * into o;
 insert into public.dispatch_decisions(lead_id,technician_id,offer_id,status,decision) values(l.id,p_technician_id,o.id,'offered',p_decision||jsonb_build_object('jobsStamp',p_jobs_stamp,'policyVersion',pol.updated_at));
 insert into public.audit_log(id,action,summary,entity_type,entity_id,recipient_technician_id,source,priority,read)
 values(gen_random_uuid()::text,'lead_offer','Ashley sent you a lead · ZIP '||z||' · respond within 5 minutes','lead_offers',o.id::text,p_technician_id,'system','high',false);
 return to_jsonb(o);
end;$$;
revoke all on function private.commit_routing_offer(text,text,jsonb,timestamptz,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function private.commit_routing_offer(text,text,jsonb,timestamptz,timestamptz,timestamptz,timestamptz) to service_role;
alter function private.commit_routing_offer(text,text,jsonb,timestamptz,timestamptz,timestamptz,timestamptz) owner to crm_workflow_executor;
-- Recheck a reservation at acceptance: intervening work, profile edits and an
-- owner pause cannot silently become an outdated automatic assignment.
create function private.routing_offer_still_valid(p_offer_id uuid,p_tid text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare dec jsonb;pol public.dispatch_policy%rowtype;pr public.technician_dispatch_profiles%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('ezfix_technician:'||p_tid,0));
 select decision into dec from public.dispatch_decisions where offer_id=p_offer_id and technician_id=p_tid;
 select * into pol from public.dispatch_policy where id=true;
 select * into pr from public.technician_dispatch_profiles where technician_id=p_tid;
 return dec is not null and pol.mode='automatic'
  and exists(select 1 from public.ai_manager_settings where id='main' and paused=false)
  and pol.updated_at=(dec->>'policyVersion')::timestamptz
  and pr.updated_at=(dec->'winner'->>'profileVersion')::timestamptz
  and pr.profile->>'enabled'='true'
  and (select max(updated_at) from public.jobs where technician_id=p_tid and deleted_at is null) is not distinct from (dec->>'jobsStamp')::timestamptz;
end;$$;
revoke all on function private.routing_offer_still_valid(uuid,text) from public,anon,authenticated,service_role;
alter function private.routing_offer_still_valid(uuid,text) owner to crm_workflow_executor;
create or replace function private.decide_lead_offer(p_offer_id uuid,p_tid text,p_accept boolean,p_channel text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.lead_offers%rowtype;l public.leads%rowtype;tn text;
begin
 if p_accept is null or p_channel is null or p_channel not in ('in_app','sms','whatsapp') then raise exception 'Invalid response';end if;
 select name into tn from public.team where id=p_tid and status='active' and role='technician' and auth_user_id is not null;
 if not found then raise exception 'Offer not available';end if;
 select * into o from public.lead_offers where id=p_offer_id and technician_id=p_tid;
 if not found then raise exception 'Offer not available';end if;
 select * into l from public.leads where id=o.lead_id and deleted_at is null for update;
 if not found then raise exception 'Offer not available';end if;
 select * into o from public.lead_offers where id=p_offer_id and technician_id=p_tid for update;
 if not found then raise exception 'Offer not available';end if;
 if o.status='pending' then
  if o.expires_at<=clock_timestamp() then
   update public.lead_offers set status='expired',responded_at=clock_timestamp() where id=o.id;
  elsif l.status in ('lost','cancelled') or l.assigned_technician_id is not null or not exists(
    select 1 from public.jobs where id=l.converted_job_id and deleted_at is null and technician_id is null and workflow_version=1 and status not in ('cancelled','completed')) then
   update public.lead_offers set status='cancelled',responded_at=clock_timestamp() where id=o.id;
  elsif not p_accept then
   update public.lead_offers set status='declined',responded_at=clock_timestamp(),responded_channel=p_channel where id=o.id;
  elsif o.routing_source='ashley' and private.routing_offer_still_valid(o.id,p_tid) is not true then
   update public.lead_offers set status='cancelled',responded_at=clock_timestamp() where id=o.id;
  else
   update public.jobs set technician_id=p_tid,technician=tn,status='technician_assigned',updated_at=now()
    where id=l.converted_job_id and technician_id is null and deleted_at is null and workflow_version=1 and status not in ('cancelled','completed');
   if not found then raise exception 'Job no longer available';end if;
   update public.leads set assigned_technician_id=p_tid,assignment_status='approved',
    app_data=coalesce(app_data,'{}')||jsonb_build_object('assigned_technician',tn),updated_at=now() where id=l.id;
   update public.lead_offers set status='accepted',responded_at=clock_timestamp(),responded_channel=p_channel where id=o.id;
   insert into public.audit_log(id,action,summary,entity_type,entity_id,source,priority,read)
    values(gen_random_uuid()::text,'lead_offer_accepted','Technician accepted lead via '||p_channel,'jobs',l.converted_job_id,'system','normal',false);
  end if;
  select * into o from public.lead_offers where id=p_offer_id;
 end if;
 return jsonb_build_object('status',o.status,'responded_channel',o.responded_channel,'responded_at',o.responded_at)
  ||case when o.status='accepted' then jsonb_build_object('job_id',l.converted_job_id) else '{}'::jsonb end;
end;$$;
revoke all on function private.decide_lead_offer(uuid,text,boolean,text) from public,anon,authenticated,service_role;


revoke create on schema private from crm_workflow_executor;
revoke crm_workflow_executor from postgres;
