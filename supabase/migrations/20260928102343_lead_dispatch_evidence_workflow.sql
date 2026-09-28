-- Lead dispatch: a pending offer contains ZIP only. Assignment happens atomically on acceptance.
create schema if not exists private;
create function private.partner_phone_key(v text) returns text language sql immutable set search_path='' as $$
 select case when length(d)=10 then '1'||d else d end from (select regexp_replace(coalesce(v,''),'[^0-9]','','g') d) x
$$;
create table public.lead_partners (
 id text primary key default gen_random_uuid()::text, name text not null check(length(trim(name))>0),
 company text, phone text, whatsapp text, email text, notes text, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index lead_partner_phone on public.lead_partners (private.partner_phone_key(phone)) where active and nullif(phone,'') is not null;
create unique index lead_partner_whatsapp on public.lead_partners(private.partner_phone_key(whatsapp)) where active and nullif(whatsapp,'') is not null;
create unique index lead_partner_email on public.lead_partners (lower(email)) where active and nullif(email,'') is not null;
alter table public.lead_partners enable row level security;
create policy lead_partners_office on public.lead_partners for all to authenticated using(public.is_office()) with check(public.is_office());
grant select,insert,update on public.lead_partners to authenticated;
grant all on public.lead_partners to service_role;
alter table public.leads add column partner_id text references public.lead_partners(id);
create index leads_partner_id_idx on public.leads(partner_id) where partner_id is not null;
create table public.lead_offers (
 id uuid primary key default gen_random_uuid(), lead_id text not null references public.leads(id),
 technician_id text not null references public.team(id), zip text not null check(zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
 status text not null default 'pending' check(status in ('pending','accepted','declined','expired','cancelled')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '5 minutes',
 responded_at timestamptz, created_by text references public.team(id), notification_status jsonb not null default '{}'
);
create unique index one_pending_offer_per_lead on public.lead_offers(lead_id) where status='pending';
create index lead_offers_technician_idx on public.lead_offers(technician_id,status,expires_at);
create index lead_offers_creator_idx on public.lead_offers(created_by);
alter table public.lead_offers enable row level security;
create policy lead_offers_read on public.lead_offers for select to authenticated using(public.is_office() or technician_id=(select public.current_team_id()));
grant select on public.lead_offers to authenticated;
grant all on public.lead_offers to service_role;

create function private.create_lead_offer(p_lead_id text,p_technician_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.leads%rowtype; o public.lead_offers%rowtype; z text;
begin
 if auth.uid() is null or not public.is_office() then raise exception 'Office access required';end if;
 select * into l from public.leads where id=p_lead_id and deleted_at is null for update;
 if not found or l.converted_job_id is null or not exists(select 1 from public.jobs where id=l.converted_job_id and workflow_version=1) then raise exception 'Approve and convert the lead before dispatch';end if;
 if l.assigned_technician_id is not null or exists(select 1 from public.jobs where id=l.converted_job_id and technician_id is not null) then raise exception 'This lead is already assigned';end if;
 if not exists(select 1 from public.team where id=p_technician_id and role='technician' and status='active' and auth_user_id is not null) then raise exception 'Select an active technician with app access';end if;
 z:=trim(coalesce(l.app_data->>'zip',''));
 if z !~ '^[0-9]{5}(-[0-9]{4})?$' then raise exception 'Add a valid ZIP code to this lead';end if;
 update public.lead_offers set status='expired',responded_at=now() where lead_id=l.id and status='pending' and expires_at<=now();
 if exists(select 1 from public.lead_offers where lead_id=l.id and status='pending') then raise exception 'An offer is still awaiting a response';end if;
 insert into public.lead_offers(lead_id,technician_id,zip,created_by) values(l.id,p_technician_id,z,public.current_team_id()) returning * into o;
 insert into public.audit_log(id,action,summary,entity_type,entity_id,recipient_technician_id,source,priority,read)
 values(gen_random_uuid()::text,'lead_offer','New lead · ZIP '||z||' · respond within 5 minutes','lead_offers',o.id::text,p_technician_id,'system','high',false);
 return to_jsonb(o);
end;$$;
create function public.create_lead_offer(p_lead_id text,p_technician_id text) returns jsonb language sql security invoker set search_path='' as $$select private.create_lead_offer(p_lead_id,p_technician_id)$$;

create function private.respond_lead_offer(p_offer_id uuid,p_accept boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.lead_offers%rowtype;l public.leads%rowtype; tid text;tn text;
begin
 tid:=public.current_team_id();if auth.uid() is null or tid is null then raise exception 'Sign in required';end if;
 -- Always lock lead before offer, matching the producer and avoiding deadlocks.
 select * into o from public.lead_offers where id=p_offer_id and technician_id=tid;
 if not found then raise exception 'Offer not available';end if;
 select * into l from public.leads where id=o.lead_id and deleted_at is null for update;
 if not found then raise exception 'Lead no longer available';end if;
 select * into o from public.lead_offers where id=p_offer_id for update;
 if o.status='accepted' then return jsonb_build_object('status','accepted','job_id',l.converted_job_id);end if;
 if o.status<>'pending' then return jsonb_build_object('status',o.status);end if;
 if o.expires_at<=clock_timestamp() then update public.lead_offers set status='expired',responded_at=now() where id=o.id;return jsonb_build_object('status','expired');end if;
 if p_accept is null then raise exception 'Accept or decline the offer';end if;
 if not p_accept then update public.lead_offers set status='declined',responded_at=now() where id=o.id;return jsonb_build_object('status','declined');end if;
 if l.assigned_technician_id is not null then raise exception 'Lead already assigned';end if;
 select name into tn from public.team where id=tid and status='active';
 update public.jobs set technician_id=tid,technician=tn,status='technician_assigned',updated_at=now() where id=l.converted_job_id and technician_id is null and deleted_at is null;
 if not found then raise exception 'Job no longer available';end if;
 update public.leads set assigned_technician_id=tid,assignment_status='approved',app_data=coalesce(app_data,'{}')||jsonb_build_object('assigned_technician',tn),updated_at=now() where id=l.id;
 update public.lead_offers set status='accepted',responded_at=now() where id=o.id;
 insert into public.audit_log(id,action,summary,entity_type,entity_id,source,priority,read) values(gen_random_uuid()::text,'lead_offer_accepted','Technician accepted lead','jobs',l.converted_job_id,'system','normal',false);
 return jsonb_build_object('status','accepted','job_id',l.converted_job_id);
end;$$;
create function public.respond_lead_offer(p_offer_id uuid,p_accept boolean) returns jsonb language sql security invoker set search_path='' as $$select private.respond_lead_offer(p_offer_id,p_accept)$$;

-- Evidence is append-only and registered against real uploaded objects.
create table public.job_evidence (
 id uuid primary key default gen_random_uuid(),job_id text not null references public.jobs(id),
 kind text not null check(kind in ('exterior','before','after')),storage_path text not null unique,
 created_by text not null references public.team(id),created_at timestamptz not null default now()
);
create index job_evidence_job_idx on public.job_evidence(job_id,kind);
create index job_evidence_creator_idx on public.job_evidence(created_by);
alter table public.job_evidence enable row level security;
create policy job_evidence_read on public.job_evidence for select to authenticated using(public.is_office() or exists(select 1 from public.jobs j where j.id=job_id and j.technician_id=(select public.current_team_id()) and j.deleted_at is null));
grant select on public.job_evidence to authenticated;grant all on public.job_evidence to service_role;
alter table public.jobs add column workflow_version integer not null default 0;
-- Only approved dispatch jobs enter the evidence workflow; standalone Quick Payment stays compatible.
-- Historical and standalone jobs retain their original workflow.
create function private.register_job_evidence(p_job_id text,p_kind text,p_storage_path text) returns uuid language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype; tid text;eid uuid;
begin
 tid:=public.current_team_id();if auth.uid() is null or tid is null then raise exception 'Sign in required';end if;
 select * into j from public.jobs where id=p_job_id and deleted_at is null for update;
 if not found or not(public.is_office() or j.technician_id=tid) then raise exception 'Job not available';end if;
 if j.status in ('completed','cancelled') then raise exception 'Job is closed';end if;
 if p_kind is null or p_kind not in ('exterior','before','after') then raise exception 'Invalid photo category';end if;
 if p_kind='before' and not exists(select 1 from public.job_evidence where job_id=j.id and kind='exterior') then raise exception 'Take the exterior photo first';end if;
 if p_kind='after' and j.status not in ('work_in_progress','waiting_for_parts','work_finished','invoice_sent','paid') then raise exception 'Start work before taking completion photos';end if;
 if p_storage_path is null or p_storage_path not like 'job-evidence/'||j.id||'/'||tid||'/%' or not exists(select 1 from storage.objects where bucket_id='crm-assets' and name=p_storage_path and owner_id=auth.uid()::text and (metadata->>'mimetype') like 'image/%') then raise exception 'Upload a job photo first';end if;
 insert into public.job_evidence(job_id,kind,storage_path,created_by) values(j.id,p_kind,p_storage_path,tid) returning id into eid;
 update public.jobs set photos=coalesce(photos,'[]')||jsonb_build_array(jsonb_build_object('id','crm-assets/'||p_storage_path,'category',case p_kind when 'exterior' then 'Exterior' when 'before' then 'Before' else 'After' end,'at',floor(extract(epoch from now())*1000),'evidenceId',eid)),updated_at=now() where id=j.id;
 return eid;
end;$$;
create function public.register_job_evidence(p_job_id text,p_kind text,p_storage_path text) returns uuid language sql security invoker set search_path='' as $$select private.register_job_evidence(p_job_id,p_kind,p_storage_path)$$;

create function private.job_payment_receipt_ready(p_job_id text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.invoices i cross join lateral (
  select coalesce(sum(coalesce(nullif(x->>'qty','')::numeric,1)*coalesce(nullif(x->>'rate','')::numeric,0)),0) subtotal,
  coalesce(sum(case when x->>'taxable'='false' then 0 else coalesce(nullif(x->>'qty','')::numeric,1)*coalesce(nullif(x->>'rate','')::numeric,0) end),0) taxable from jsonb_array_elements(coalesce(i.items,'[]')) x
 ) s cross join lateral (select least(greatest(coalesce(i.discount,0),0),greatest(s.subtotal,0)) d) d
 cross join lateral (select round(s.subtotal-d.d+round(s.taxable*case when s.subtotal>0 then (s.subtotal-d.d)/s.subtotal else 1 end*coalesce(i.tax_rate,0)/100,2),2) total) t
 where i.job_id=p_job_id and i.deleted_at is null and t.total>0
 and (select coalesce(sum(greatest(0,coalesce(nullif(p->>'appliedAmount','')::numeric,nullif(p->>'amount','')::numeric,0))),0) from jsonb_array_elements(coalesce(i.payments,'[]')) p)+0.005>=t.total
 and exists(select 1 from public.email_delivery_events e where e.invoice_id=i.id and e.provider_message_id=i.app_data->>'receiptEmailProviderMessageId' and e.event_type='email.delivered' and exists(select 1 from public.audit_log a where a.entity_type='invoices' and a.entity_id=i.id and a.action='receipt_email_accepted' and a.source='provider' and a.related_id=e.provider_message_id))
 );$$;
create function private.enforce_job_workflow() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.workflow_version<>old.workflow_version and not (public.is_office() and old.workflow_version=0 and new.workflow_version=1 and old.status in ('new','scheduled','confirmed')) then raise exception 'Workflow version is server managed';end if;
 if new.workflow_version<1 then return new;end if;
 if tg_op='UPDATE' and new.technician_id is distinct from old.technician_id and current_user<>'crm_workflow_executor' then raise exception 'Use a lead offer to assign this job';end if;
 if new.status in ('arrived','inspection','estimate_presented','approved','work_in_progress','waiting_for_parts','work_finished','invoice_sent','paid','completed') and not exists(select 1 from public.job_evidence where job_id=new.id and kind='exterior') then raise exception 'Exterior arrival photo required';end if;
 if new.status in ('work_in_progress','waiting_for_parts','work_finished','invoice_sent','paid','completed') then
  if not exists(select 1 from public.job_evidence where job_id=new.id and kind='exterior') then raise exception 'Exterior arrival photo required';end if;
  if not exists(select 1 from public.job_evidence where job_id=new.id and kind='before') then raise exception 'Before-work parts or work-area photo required';end if;
 end if;
 if new.status in ('work_finished','invoice_sent','paid','completed') and not exists(select 1 from public.job_evidence where job_id=new.id and kind='after') then raise exception 'Installed parts / finished work photo required';end if;
 if new.status='completed' and not private.job_payment_receipt_ready(new.id) then raise exception 'Full payment and confirmed receipt delivery required before closing the job';end if;
 return new;
end;$$;
create trigger enforce_job_workflow before insert or update on public.jobs for each row execute function private.enforce_job_workflow();
create function private.enforce_invoice_evidence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.job_id is not null and exists(select 1 from public.jobs where id=new.job_id and workflow_version=1) and not exists(select 1 from public.job_evidence where job_id=new.job_id and kind='after') then raise exception 'Photograph installed parts / finished work before creating an invoice';end if;
 return new;
end;$$;
create trigger enforce_invoice_evidence before insert or update of job_id on public.invoices for each row execute function private.enforce_invoice_evidence();

-- Inbound messages remain untrusted, unassigned review items until office approval.
create table private.partner_message_claims(provider text,message_id text,lead_id text references public.leads(id),primary key(provider,message_id));
alter table private.partner_message_claims enable row level security;
create function public.ingest_partner_message(p_channel text,p_sender text,p_message_id text,p_body text) returns text language plpgsql security invoker set search_path='' as $$
declare p public.lead_partners%rowtype;lid text;digits text;
begin
 if p_channel is null or p_channel not in ('sms','whatsapp','email') or length(coalesce(p_message_id,''))=0 then raise exception 'Invalid inbound message';end if;
 digits:=private.partner_phone_key(p_sender);
 if (p_channel<>'email' and length(digits)<8) or length(trim(coalesce(p_sender,'')))=0 then return null;end if;
 select * into p from public.lead_partners where active and case when p_channel='email' then lower(email)=lower(trim(p_sender)) when p_channel='whatsapp' then private.partner_phone_key(whatsapp)=digits else private.partner_phone_key(phone)=digits end limit 1 for update;
 if not found then return null;end if;
 if length(trim(coalesce(p_body,'')))<3 then return null;end if;
 if exists(select 1 from private.partner_message_claims where provider=p_channel and message_id=p_message_id) then return (select lead_id from private.partner_message_claims where provider=p_channel and message_id=p_message_id);end if;
 if (select count(*) from public.leads where partner_id=p.id and created_at>now()-interval '1 hour')>=100 then return null;end if;
 lid:='partner_'||gen_random_uuid()::text;
 insert into private.partner_message_claims(provider,message_id) values(p_channel,p_message_id) on conflict do nothing;
 if not found then return (select lead_id from private.partner_message_claims where provider=p_channel and message_id=p_message_id);end if;
 insert into public.leads(id,name,notes,status,source,source_provider,source_channel,partner_id,app_data)
 values(lid,'New referral from '||p.name,left(p_body,20000),'new',p.name,'partner',p_channel,p.id,jsonb_build_object('needs_review',true,'partner_message_id',p_message_id));
 update private.partner_message_claims set lead_id=lid where provider=p_channel and message_id=p_message_id;
 insert into public.audit_log(id,action,summary,entity_type,entity_id,source,priority,read) values(gen_random_uuid()::text,'partner_lead_received','New referral from '||p.name||' via '||p_channel,'leads',lid,'provider','high',false);
 return lid;
end;$$;
create function private.capture_partner_sms() returns trigger language plpgsql security definer set search_path='' as $$
declare lid text;
begin
 if new.direction='inbound' then
  lid:=public.ingest_partner_message('sms',coalesce(new.normalized_remote_phone,new.remote_phone_number),coalesce(nullif(new.provider_message_id,''),new.id),new.message_text);
  if lid is not null then new.lead_id:=lid;end if;
 end if;return new;
end;$$;
create trigger capture_partner_sms before insert or update of message_text on public.sms_messages for each row execute function private.capture_partner_sms();

create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),team_id text not null references public.team(id),endpoint text not null unique,
 subscription jsonb not null,created_at timestamptz not null default now(), check(jsonb_typeof(subscription)='object' and subscription->>'endpoint'=endpoint)
);
alter table public.push_subscriptions enable row level security;
create index push_subscription_team_idx on public.push_subscriptions(team_id);
create policy push_subscription_self on public.push_subscriptions for all to authenticated using(team_id=(select public.current_team_id())) with check(team_id=(select public.current_team_id()));
grant select,insert,update,delete on public.push_subscriptions to authenticated;grant all on public.push_subscriptions to service_role;
create table private.push_config(id boolean primary key default true check(id),public_key text not null,private_key text not null);
alter table private.push_config enable row level security;
create function private.push_public_key() returns text language sql stable security definer set search_path='' as $$select public_key from private.push_config where auth.uid() is not null and public.current_team_id() is not null$$;
create function public.service_push_config() returns jsonb language sql security invoker set search_path='' as $$select to_jsonb(c) from private.push_config c$$;
grant usage on schema private to authenticated,service_role;
grant all on private.partner_message_claims,private.push_config to service_role;
revoke all on function public.ingest_partner_message(text,text,text,text),public.service_push_config() from public,anon,authenticated;
grant execute on function public.ingest_partner_message(text,text,text,text),public.service_push_config() to service_role;
revoke all on function private.create_lead_offer(text,text),private.respond_lead_offer(uuid,boolean),private.register_job_evidence(text,text,text),public.create_lead_offer(text,text),public.respond_lead_offer(uuid,boolean),public.register_job_evidence(text,text,text) from public,anon;
grant execute on function private.create_lead_offer(text,text),private.respond_lead_offer(uuid,boolean),private.register_job_evidence(text,text,text),public.create_lead_offer(text,text),public.respond_lead_offer(uuid,boolean),public.register_job_evidence(text,text,text) to authenticated;
revoke all on function private.job_payment_receipt_ready(text),private.enforce_job_workflow(),private.enforce_invoice_evidence(),private.capture_partner_sms() from public,anon,authenticated;

create function public.push_public_key() returns text language sql stable security invoker set search_path='' as $$select private.push_public_key()$$;
revoke all on function public.push_public_key(),private.push_public_key() from public,anon;
grant execute on function public.push_public_key(),private.push_public_key() to authenticated;

create policy evidence_storage_read on storage.objects as restrictive for select to authenticated
using(name not like 'job-evidence/%' or public.is_office() or exists(select 1 from public.jobs j where j.id=split_part(name,'/',2) and j.technician_id=(select public.current_team_id()) and j.deleted_at is null));
create policy evidence_storage_insert on storage.objects as restrictive for insert to authenticated
with check(name not like 'job-evidence/%' or (split_part(name,'/',3)=(select public.current_team_id()) and exists(select 1 from public.jobs j where j.id=split_part(name,'/',2) and (public.is_office() or j.technician_id=(select public.current_team_id())) and j.deleted_at is null)));
create policy evidence_storage_delete on storage.objects as restrictive for delete to authenticated using(name not like 'job-evidence/%');
create policy evidence_storage_update on storage.objects as restrictive for update to authenticated using(name not like 'job-evidence/%') with check(name not like 'job-evidence/%');

-- Narrow, non-login execution role: clients cannot SET ROLE or obtain table write grants.
create role crm_workflow_executor nologin noinherit;
grant crm_workflow_executor to postgres;
grant usage on schema public,private,auth,storage to crm_workflow_executor;
grant create on schema private to crm_workflow_executor;
grant select on public.team,public.leads,public.jobs,public.lead_offers,public.job_evidence to crm_workflow_executor;
grant update on public.leads,public.jobs,public.lead_offers to crm_workflow_executor;
grant insert on public.audit_log to crm_workflow_executor;
create policy dispatch_executor_leads on public.leads for all to crm_workflow_executor using(true) with check(true);
create policy dispatch_executor_jobs on public.jobs for all to crm_workflow_executor using(true) with check(true);
create policy dispatch_executor_offers on public.lead_offers for all to crm_workflow_executor using(true) with check(true);
create policy dispatch_executor_team on public.team for select to crm_workflow_executor using(true);
create policy dispatch_executor_evidence on public.job_evidence for select to crm_workflow_executor using(true);
create policy dispatch_executor_audit on public.audit_log for insert to crm_workflow_executor with check(true);
grant execute on function private.job_payment_receipt_ready(text) to authenticated,crm_workflow_executor;
alter function private.respond_lead_offer(uuid,boolean) owner to crm_workflow_executor;

create function public.approve_lead_for_dispatch(p_lead_id text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.leads%rowtype;j public.jobs%rowtype;cid text;jid text;addr text;d text;dt date;
begin
 if auth.uid() is null or not public.is_office() then raise exception 'Office access required';end if;
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
  if not found or j.technician_id is not null or j.status not in ('new','scheduled','confirmed') then raise exception 'Existing job is unavailable for dispatch';end if;
  update public.jobs set customer_id=cid,customer_name=l.name,workflow_version=1,scheduled_date=coalesce(dt,scheduled_date),appointment_window=coalesce(l.app_data->>'preferred_time',appointment_window),app_data=coalesce(app_data,'{}')||jsonb_build_object('sourceLeadId',l.id,'service_address',addr) where id=jid;
 end if;
 update public.leads set status='converted',converted_customer_id=cid,converted_job_id=jid,assignment_status='unassigned',app_data=coalesce(app_data,'{}')||jsonb_build_object('needs_review',false) where id=l.id;
 return jsonb_build_object('customer_id',cid,'job_id',jid);
end;$$;
revoke all on function public.approve_lead_for_dispatch(text) from public,anon;
grant execute on function public.approve_lead_for_dispatch(text) to authenticated;

create function private.complete_dispatch_job(p_job_id text,p_signature jsonb) returns void language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype;tid text;
begin
 tid:=public.current_team_id();if auth.uid() is null or tid is null then raise exception 'Sign in required';end if;
 select * into j from public.jobs where id=p_job_id and deleted_at is null for update;
 if not found or not(public.is_office() or j.technician_id=tid) or j.workflow_version<>1 then raise exception 'Job unavailable';end if;
 if j.status='completed' then return;end if;
 if not private.job_payment_receipt_ready(j.id) then raise exception 'Full payment and confirmed receipt delivery required before closing';end if;
 if p_signature is null or length(coalesce(p_signature->>'name',''))<1 or length(coalesce(p_signature->>'dataUrl','')) not between 100 and 1000000 or coalesce(p_signature->>'dataUrl','') not like 'data:image/%' then raise exception 'Customer signature required';end if;
 update public.jobs set status='completed',status_history=coalesce(status_history,'[]')||jsonb_build_array(jsonb_build_object('status','completed','at',floor(extract(epoch from now())*1000))),app_data=coalesce(app_data,'{}')||jsonb_build_object('completion_signature',p_signature||jsonb_build_object('at',floor(extract(epoch from now())*1000))) where id=j.id;
end;$$;
create function public.complete_dispatch_job(p_job_id text,p_signature jsonb) returns void language sql security invoker set search_path='' as $$select private.complete_dispatch_job(p_job_id,p_signature)$$;
alter function private.complete_dispatch_job(text,jsonb) owner to crm_workflow_executor;
revoke all on function private.complete_dispatch_job(text,jsonb),public.complete_dispatch_job(text,jsonb) from public,anon;
grant execute on function private.complete_dispatch_job(text,jsonb),public.complete_dispatch_job(text,jsonb) to authenticated;

create function public.dispatch_job_ready(p_job_id text) returns boolean language sql stable security invoker set search_path='' as $$
 select private.job_payment_receipt_ready(id) from public.jobs where id=p_job_id and deleted_at is null
$$;
revoke all on function public.dispatch_job_ready(text) from public,anon;
grant execute on function public.dispatch_job_ready(text) to authenticated;

create function private.protect_dispatch_lead() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.partner_id is distinct from old.partner_id and not public.is_office() then raise exception 'Lead source is office managed';end if;
 if new.assigned_technician_id is distinct from old.assigned_technician_id and current_user<>'crm_workflow_executor' and exists(select 1 from public.jobs where id=new.converted_job_id and workflow_version=1) then raise exception 'Use a lead offer to assign this lead';end if;
 return new;
end;$$;
create trigger protect_dispatch_lead before update on public.leads for each row execute function private.protect_dispatch_lead();
revoke all on function private.protect_dispatch_lead() from public,anon,authenticated;

-- Keep final paid/receipt state visible without exposing other jobs through a boolean RPC.
create function public.service_init_push_config(p_public_key text,p_private_key text) returns void language sql security invoker set search_path='' as $$
 insert into private.push_config(id,public_key,private_key) values(true,p_public_key,p_private_key) on conflict(id) do nothing
$$;
create function public.service_claim_offer_notification(p_offer_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.lead_offers set notification_status='{"state":"sending"}' where id=p_offer_id and status='pending' and expires_at>now() and notification_status='{}';return found;
end;$$;
revoke all on function public.service_init_push_config(text,text),public.service_claim_offer_notification(uuid) from public,anon,authenticated;
grant execute on function public.service_init_push_config(text,text),public.service_claim_offer_notification(uuid) to service_role;

-- Offer events use a separate table so pending technicians receive no customer data.
alter publication supabase_realtime add table public.lead_offers;
alter publication supabase_realtime add table public.job_evidence;
alter publication supabase_realtime add table public.lead_partners;
alter publication supabase_realtime add table public.audit_log;

CREATE OR REPLACE FUNCTION public.protect_app_data_from_non_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only the non-login role owning the validated dispatch RPCs may change protected fields.
  IF current_user = 'crm_workflow_executor' THEN RETURN NEW; END IF;
  IF current_user = 'service_role' OR public.is_owner() THEN
    RETURN NEW;
  END IF;
  IF NEW.app_data IS DISTINCT FROM OLD.app_data THEN
    RAISE EXCEPTION 'app_data is owner-managed';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_job_technician_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only the non-login role owning the validated dispatch RPCs may change protected fields.
  IF current_user = 'crm_workflow_executor' THEN RETURN NEW; END IF;
  if public.is_office() then
    return new;
  end if;
  if new.customer_id is distinct from old.customer_id
     or new.technician_id is distinct from old.technician_id
     or new.estimate_id is distinct from old.estimate_id
     or new.customer_name is distinct from old.customer_name
     or new.technician is distinct from old.technician
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.complaint is distinct from old.complaint
     or new.payment_method is distinct from old.payment_method
     or new.property_type is distinct from old.property_type
     or new.door_size is distinct from old.door_size
     or new.door_quantity is distinct from old.door_quantity
     or new.material_cost is distinct from old.material_cost
     or new.scheduled_date is distinct from old.scheduled_date
     or new.appointment_window is distinct from old.appointment_window
     or new.job_number is distinct from old.job_number
     or new.deleted_at is distinct from old.deleted_at
  then
    raise exception 'jobs: technician may only update status, checklist, diagnosis, recommended_repair, internal_notes, photos, status_history, cancel_reason';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_lead_technician_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only the non-login role owning the validated dispatch RPCs may change protected fields.
  IF current_user = 'crm_workflow_executor' THEN RETURN NEW; END IF;
  if public.is_office() then
    return new;
  end if;
  if new.name is distinct from old.name
     or new.email is distinct from old.email
     or new.phone is distinct from old.phone
     or new.address is distinct from old.address
     or new.service_requested is distinct from old.service_requested
     or new.source is distinct from old.source
     or new.source_email_id is distinct from old.source_email_id
     or new.source_provider is distinct from old.source_provider
     or new.source_channel is distinct from old.source_channel
     or new.source_call_id is distinct from old.source_call_id
     or new.assignment_status is distinct from old.assignment_status
     or new.converted_customer_id is distinct from old.converted_customer_id
     or new.converted_job_id is distinct from old.converted_job_id
     or new.assigned_technician_id is distinct from old.assigned_technician_id
     or new.deleted_at is distinct from old.deleted_at
  then
    raise exception 'leads: technician may only update status, notes, next_follow_up, last_contact, decline_reason';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_technician_job_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- Only the non-login role owning the validated dispatch RPCs may change protected fields.
  IF current_user = 'crm_workflow_executor' THEN RETURN NEW; END IF;
  if lower(coalesce(public.current_app_role(),'')) = 'technician' then
    if new.customer_id is distinct from old.customer_id
       or new.technician_id is distinct from old.technician_id
       or new.estimate_id is distinct from old.estimate_id
       or new.job_number is distinct from old.job_number
       or new.created_at is distinct from old.created_at
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Technician cannot change job ownership or linkage fields' using errcode='42501';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.protect_technician_lead_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- Only the non-login role owning the validated dispatch RPCs may change protected fields.
  IF current_user = 'crm_workflow_executor' THEN RETURN NEW; END IF;
  if lower(coalesce(public.current_app_role(),'')) = 'technician' then
    if new.assigned_technician_id is distinct from old.assigned_technician_id
       or new.source is distinct from old.source
       or new.source_email_id is distinct from old.source_email_id
       or new.source_provider is distinct from old.source_provider
       or new.source_channel is distinct from old.source_channel
       or new.source_call_id is distinct from old.source_call_id
       or new.converted_customer_id is distinct from old.converted_customer_id
       or new.converted_job_id is distinct from old.converted_job_id
       or new.created_at is distinct from old.created_at
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Technician cannot change lead assignment, source, or conversion linkage' using errcode='42501';
    end if;
  end if;
  return new;
end $function$
;

revoke create on schema private from crm_workflow_executor;

-- No customer information is included in expiry alerts.
create function private.expire_lead_offers() returns void language plpgsql security definer set search_path='' as $$
declare o public.lead_offers%rowtype;
begin
 for o in update public.lead_offers set status='expired',responded_at=now() where status='pending' and expires_at<=clock_timestamp() returning * loop
  insert into public.audit_log(id,action,summary,entity_type,entity_id,source,priority,read) values(gen_random_uuid()::text,'lead_offer_expired','Lead offer expired — choose a technician','leads',o.lead_id,'system','high',false);
 end loop;
end;$$;
revoke all on function private.expire_lead_offers() from public,anon,authenticated;
select cron.schedule('ezfix-expire-lead-offers','* * * * *','select private.expire_lead_offers()');
alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.customers;

revoke crm_workflow_executor from postgres;
