-- Owner-defined routing policy and private business scoring profiles.
create table public.dispatch_policy (
 id boolean primary key default true check(id),
 mode text not null default 'recommend' check(mode in ('off','recommend','automatic')),
 enabled_since timestamptz not null default now(),
 config jsonb not null default '{}' check(jsonb_typeof(config)='object'),
 updated_at timestamptz not null default now()
);
insert into public.dispatch_policy(id) values(true);
create table public.technician_dispatch_profiles (
 technician_id text primary key references public.team(id),
 profile jsonb not null default '{}' check(jsonb_typeof(profile)='object'),
 updated_at timestamptz not null default now()
);
create table public.dispatch_decisions (
 id uuid primary key default gen_random_uuid(),lead_id text not null references public.leads(id),
 technician_id text references public.team(id),offer_id uuid references public.lead_offers(id),
 status text not null check(status in ('held','offered')),decision jsonb not null,
 created_at timestamptz not null default now()
);
create index dispatch_decisions_lead_idx on public.dispatch_decisions(lead_id,created_at desc);
create index dispatch_decisions_tech_idx on public.dispatch_decisions(technician_id);
create index dispatch_decisions_offer_idx on public.dispatch_decisions(offer_id);
create index dispatch_decisions_created_idx on public.dispatch_decisions(created_at desc);
create unique index dispatch_decisions_one_offer on public.dispatch_decisions(offer_id) where offer_id is not null;
comment on table public.dispatch_decisions is 'Office-only business scoring evidence. No raw response tokens or customer transcripts.';
alter table public.dispatch_policy enable row level security;
alter table public.technician_dispatch_profiles enable row level security;
alter table public.dispatch_decisions enable row level security;
create policy dispatch_policy_read on public.dispatch_policy for select to authenticated using(public.is_office());
create policy dispatch_profiles_read on public.technician_dispatch_profiles for select to authenticated using(public.is_office());
create policy dispatch_decisions_read on public.dispatch_decisions for select to authenticated using(public.is_office());
grant select on public.dispatch_policy,public.technician_dispatch_profiles,public.dispatch_decisions to authenticated;
grant all on public.dispatch_policy,public.technician_dispatch_profiles,public.dispatch_decisions to service_role;
revoke insert,update,delete on public.dispatch_policy,public.technician_dispatch_profiles,public.dispatch_decisions from anon,authenticated;
alter table public.lead_offers add column routing_source text not null default 'office' check(routing_source in ('office','ashley'));

-- The non-login executor owns narrowly exposed workflow functions. It cannot be
-- assumed by authenticated users; tokens and office-only scores stay protected.
grant crm_workflow_executor to postgres;
grant create on schema private to crm_workflow_executor;
grant select on public.dispatch_policy,public.technician_dispatch_profiles,public.dispatch_decisions,public.customers to crm_workflow_executor;
grant insert on public.dispatch_decisions,public.lead_offers,public.customers,public.jobs to crm_workflow_executor;
grant execute on function private.partner_phone_key(text) to crm_workflow_executor;
create policy dispatch_executor_customers on public.customers for all to crm_workflow_executor using(true) with check(true);
create policy dispatch_executor_policy on public.dispatch_policy for select to crm_workflow_executor using(true);
create policy dispatch_executor_profiles on public.technician_dispatch_profiles for select to crm_workflow_executor using(true);
create policy dispatch_executor_decisions on public.dispatch_decisions for all to crm_workflow_executor using(true) with check(true);

create function private.prepare_auto_dispatch_lead(p_lead_id text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.leads%rowtype;j public.jobs%rowtype;cid text;jid text;addr text;d text;dt date;
begin
 select * into l from public.leads where id=p_lead_id and deleted_at is null for update;
 if not found then raise exception 'Lead not available';end if;
 if nullif(trim(l.name),'') is null or l.name like 'New referral from %' or nullif(trim(l.phone),'') is null or nullif(trim(l.address),'') is null or coalesce(l.app_data->>'zip','') !~ '^[0-9]{5}(-[0-9]{4})?$' then raise exception 'Review the customer name, phone, address and ZIP before approving';end if;
 if l.status in ('lost','cancelled') then raise exception 'Reopen the lead before approving';end if;
 if l.assigned_technician_id is not null then raise exception 'Lead already assigned';end if;
 addr:=concat_ws(', ',nullif(l.address,''),nullif(l.app_data->>'city',''),nullif(l.app_data->>'state',''),nullif(l.app_data->>'zip',''));
 d:=coalesce(nullif(l.app_data->>'preferred_appointment',''),nullif(l.app_data->>'preferred_date',''));
 if d ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then dt:=d::date;end if;
 cid:=l.converted_customer_id;
 if cid is null then
  select id into cid from public.customers where deleted_at is null and private.partner_phone_key(phone)=private.partner_phone_key(l.phone) and lower(trim(name))=lower(trim(l.name)) and lower(trim(coalesce(address,'')))=lower(trim(addr)) order by created_at limit 1;
  if cid is null then
   cid:='customer_'||gen_random_uuid()::text;
   insert into public.customers(id,name,email,phone,address,notes,app_data) values(cid,l.name,l.email,l.phone,addr,l.notes,jsonb_build_object('leadSource',l.source));
  end if;
 end if;
 if not exists(select 1 from public.customers where id=cid and deleted_at is null) then raise exception 'Customer not available';end if;
 jid:=l.converted_job_id;
 if jid is null then
  jid:='job_'||gen_random_uuid()::text;
  insert into public.jobs(id,customer_id,customer_name,title,description,status,scheduled_date,appointment_window,workflow_version,app_data)
  values(jid,cid,l.name,coalesce(nullif(l.service_requested,''),'Service request'),l.notes,case when dt is null then 'new' else 'scheduled' end,dt,coalesce(l.app_data->>'preferred_time',l.app_data->>'appointment_window'),1,jsonb_build_object('sourceLeadId',l.id,'service_address',addr));
 else
  select * into j from public.jobs where id=jid and deleted_at is null for update;
  if not found or j.workflow_version<>1 or j.technician_id is not null or j.status not in ('new','scheduled','confirmed') then raise exception 'Existing job is unavailable for dispatch';end if;
  update public.jobs set customer_id=cid,customer_name=l.name,workflow_version=1,scheduled_date=coalesce(dt,scheduled_date),appointment_window=coalesce(l.app_data->>'preferred_time',appointment_window),app_data=coalesce(app_data,'{}')||jsonb_build_object('sourceLeadId',l.id,'service_address',addr) where id=jid;
 end if;
 update public.leads set status='converted',converted_customer_id=cid,converted_job_id=jid,assignment_status='unassigned',app_data=coalesce(app_data,'{}')||jsonb_build_object('needs_review',false) where id=l.id;
 return jsonb_build_object('customer_id',cid,'job_id',jid);
end;$$;
revoke all on function private.prepare_auto_dispatch_lead(text) from public,anon,authenticated,service_role;
alter function private.prepare_auto_dispatch_lead(text) owner to crm_workflow_executor;

create function private.commit_routing_offer(p_lead_id text,p_technician_id text,p_decision jsonb,p_policy_version timestamptz,p_profile_version timestamptz,p_lead_version timestamptz,p_jobs_stamp timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pol public.dispatch_policy%rowtype;pr public.technician_dispatch_profiles%rowtype;l public.leads%rowtype;o public.lead_offers%rowtype;z text;typ text;sl jsonb;d date;start_min integer;end_min integer;shift jsonb;
begin
 -- Serialize automatic offer reservations; manual assignment is checked again
 -- by the acceptance transaction. No live assignment happens at this stage.
 perform pg_advisory_xact_lock(hashtextextended('ezfix_automatic_dispatch',0));
 select * into pol from public.dispatch_policy where id=true;
 if pol.mode<>'automatic' or pol.updated_at<>p_policy_version then raise exception 'Routing policy changed';end if;
 select * into l from public.leads where id=p_lead_id and deleted_at is null for update;
 if not found or l.updated_at<>p_lead_version or l.source<>'AI Receptionist' or l.assigned_technician_id is not null or l.status in ('lost','cancelled') then raise exception 'Lead changed or unavailable';end if;
 if l.created_at<pol.enabled_since and not exists(select 1 from public.dispatch_decisions where lead_id=l.id and status='offered') then raise exception 'Historical lead requires office review';end if;
 select * into pr from public.technician_dispatch_profiles where technician_id=p_technician_id;
 if not found or pr.updated_at<>p_profile_version or (pr.profile->>'enabled')::boolean is not true then raise exception 'Technician profile changed';end if;
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
 insert into public.dispatch_decisions(lead_id,technician_id,offer_id,status,decision) values(l.id,p_technician_id,o.id,'offered',p_decision);
 insert into public.audit_log(id,action,summary,entity_type,entity_id,recipient_technician_id,source,priority,read)
 values(gen_random_uuid()::text,'lead_offer','Ashley sent you a lead · ZIP '||z||' · respond within 5 minutes','lead_offers',o.id::text,p_technician_id,'system','high',false);
 return to_jsonb(o);
end;$$;
revoke all on function private.commit_routing_offer(text,text,jsonb,timestamptz,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function private.commit_routing_offer(text,text,jsonb,timestamptz,timestamptz,timestamptz,timestamptz) to service_role;
alter function private.commit_routing_offer(text,text,jsonb,timestamptz,timestamptz,timestamptz,timestamptz) owner to crm_workflow_executor;
create function public.service_commit_routing_offer(p_lead_id text,p_technician_id text,p_decision jsonb,p_policy_version timestamptz,p_profile_version timestamptz,p_lead_version timestamptz,p_jobs_stamp timestamptz)
returns jsonb language sql security invoker set search_path='' as $$select private.commit_routing_offer(p_lead_id,p_technician_id,p_decision,p_policy_version,p_profile_version,p_lead_version,p_jobs_stamp)$$;
revoke all on function public.service_commit_routing_offer(text,text,jsonb,timestamptz,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.service_commit_routing_offer(text,text,jsonb,timestamptz,timestamptz,timestamptz,timestamptz) to service_role;
revoke create on schema private from crm_workflow_executor;
revoke crm_workflow_executor from postgres;
