grant crm_workflow_executor to postgres;
grant create on schema private to crm_workflow_executor;
-- Explicit, short-lived allowlist for owner-authorized demo delivery. No seed.
create table public.dispatch_demo_runs(
 batch_id text primary key,
 lead_ids text[] not null check(cardinality(lead_ids) between 1 and 7),
 technician_ids text[] not null check(cardinality(technician_ids) between 1 and 10),
 recipient_phone text not null check(recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
 enabled boolean not null default false,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 authorization_note text not null,
 check(expires_at>created_at and expires_at<=created_at+interval '1 hour')
);
alter table public.dispatch_demo_runs enable row level security;
revoke all on public.dispatch_demo_runs from public,anon,authenticated;
grant select,insert,update,delete on public.dispatch_demo_runs to service_role;
grant select on public.dispatch_demo_runs to crm_workflow_executor;
create policy demo_run_executor_read on public.dispatch_demo_runs for select to crm_workflow_executor using(true);
create or replace function private.commit_routing_offer(p_lead_id text,p_technician_id text,p_decision jsonb,p_policy_version timestamptz,p_profile_version timestamptz,p_lead_version timestamptz,p_jobs_stamp timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pol public.dispatch_policy%rowtype;pr public.technician_dispatch_profiles%rowtype;l public.leads%rowtype;o public.lead_offers%rowtype;z text;typ text;sl jsonb;d date;start_min integer;end_min integer;shift jsonb;demo boolean:=false;
begin
 -- Serialize automatic offer reservations; manual assignment is checked again
 -- by the acceptance transaction. No live assignment happens at this stage.
 perform pg_advisory_xact_lock(hashtextextended('ezfix_automatic_dispatch',0));
 select * into pol from public.dispatch_policy where id=true;
 if pol.mode<>'automatic' or pol.updated_at is distinct from p_policy_version or not exists(select 1 from public.ai_manager_settings where id='main' and paused=false) then raise exception 'Routing policy changed';end if;
 select * into l from public.leads where id=p_lead_id and deleted_at is null for update;
 if not found or l.updated_at is distinct from p_lead_version or l.assigned_technician_id is not null or l.status in ('lost','cancelled') then raise exception 'Lead changed or unavailable';end if;
 select exists(select 1 from public.dispatch_demo_runs r join public.team t on t.id=p_technician_id
  where r.enabled and r.expires_at>clock_timestamp() and r.batch_id=p_decision->>'demo_run'
  and l.id=any(r.lead_ids) and t.id=any(r.technician_ids)
  and l.source='Demo' and l.app_data->'is_demo'='true'::jsonb and l.app_data->>'demo_batch'=r.batch_id
  and t.app_data->'is_demo'='true'::jsonb and t.app_data->>'demo_batch'=r.batch_id
  and t.app_data->'demo_contact_owner_confirmed'='true'::jsonb
  and t.app_data->'whatsapp_opt_in'='true'::jsonb and t.app_data->>'whatsapp_number'=r.recipient_phone) into demo;
 if l.source<>'AI Receptionist' and not demo then raise exception 'Lead source is not authorized for routing';end if;
 if not demo and (l.app_data ? 'demo_batch' or exists(select 1 from public.team where id=p_technician_id and app_data ? 'demo_batch')) then raise exception 'Demo routing requires an active scoped run';end if;
 if demo and exists(select 1 from public.lead_offers where lead_id=l.id) then raise exception 'Demo lead already offered; no automatic repeat';end if;
 if not demo and l.created_at<pol.enabled_since and not exists(select 1 from public.dispatch_decisions where lead_id=l.id and status='offered') then raise exception 'Historical lead requires office review';end if;
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

revoke create on schema private from crm_workflow_executor;
revoke crm_workflow_executor from postgres;
