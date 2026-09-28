-- One decision for the in-app, SMS and WhatsApp copies of a lead offer.
grant crm_workflow_executor to postgres;
grant create on schema private to crm_workflow_executor;
alter table public.lead_offers add column responded_channel text
 check(responded_channel in ('in_app','sms','whatsapp'));

create table private.lead_offer_tokens (
 offer_id uuid not null references public.lead_offers(id) on delete cascade,
 channel text not null check(channel in ('sms','whatsapp')),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 auth_user_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(offer_id,channel)
);
alter table private.lead_offer_tokens enable row level security;
revoke all on private.lead_offer_tokens from public,anon,authenticated,service_role;
grant select on private.lead_offer_tokens to crm_workflow_executor;
create policy offer_tokens_executor on private.lead_offer_tokens for select to crm_workflow_executor using(true);

-- Only the privileged wrappers may call this transaction. All lock the lead
-- before the offer, so concurrent responses and reassignment share one winner.
create function private.decide_lead_offer(p_offer_id uuid,p_tid text,p_accept boolean,p_channel text)
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

create or replace function private.respond_lead_offer(p_offer_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tid text;
begin
 tid:=public.current_team_id();
 if auth.uid() is null or tid is null then raise exception 'Sign in required';end if;
 return private.decide_lead_offer(p_offer_id,tid,p_accept,'in_app');
end;$$;

-- Issued only after an office-authorized offer has claimed its notification.
-- The database stores hashes, never raw bearer tokens. No client may issue them.
create function private.issue_lead_offer_tokens(p_offer_id uuid,p_sms_hash text,p_whatsapp_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare o public.lead_offers%rowtype;uid uuid;
begin
 if p_sms_hash is null or p_whatsapp_hash is null or p_sms_hash !~ '^[0-9a-f]{64}$' or p_whatsapp_hash !~ '^[0-9a-f]{64}$' or p_sms_hash=p_whatsapp_hash then raise exception 'Invalid token hashes';end if;
 select * into o from public.lead_offers where id=p_offer_id and status='pending' and expires_at>clock_timestamp() and notification_status->>'state'='sending' for update;
 if not found then return false;end if;
 select auth_user_id into uid from public.team where id=o.technician_id and role='technician' and status='active';
 if uid is null then return false;end if;
 if exists(select 1 from private.lead_offer_tokens where offer_id=p_offer_id) then return false;end if;
 insert into private.lead_offer_tokens(offer_id,channel,token_hash,auth_user_id)
 values(p_offer_id,'sms',p_sms_hash,uid),(p_offer_id,'whatsapp',p_whatsapp_hash,uid);
 return true;
end;$$;
create function public.service_issue_lead_offer_tokens(p_offer_id uuid,p_sms_hash text,p_whatsapp_hash text)
returns boolean language sql security invoker set search_path='' as $$select private.issue_lead_offer_tokens(p_offer_id,p_sms_hash,p_whatsapp_hash)$$;

-- A link preview is read-only. An explicit response uses the exact same core as
-- authenticated in-app acceptance. Responses reveal ZIP/status only, never PII.
create function private.lead_offer_link(p_token_hash text,p_accept boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tok private.lead_offer_tokens%rowtype;o public.lead_offers%rowtype;r jsonb;
begin
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return null;end if;
 select * into tok from private.lead_offer_tokens where token_hash=p_token_hash;
 if not found then return null;end if;
 select o1.* into o from public.lead_offers o1 join public.team t on t.id=o1.technician_id
  join public.leads l on l.id=o1.lead_id
  where o1.id=tok.offer_id and t.status='active' and t.role='technician' and t.auth_user_id=tok.auth_user_id and l.deleted_at is null;
 if not found then return null;end if;
 if p_accept is not null then
  r:=private.decide_lead_offer(o.id,o.technician_id,p_accept,tok.channel);
  select * into o from public.lead_offers where id=tok.offer_id;
 end if;
 return jsonb_build_object('status',case when o.status='pending' and o.expires_at<=clock_timestamp() then 'expired' else o.status end,
  'zip',o.zip,'expires_at',o.expires_at,'responded_at',o.responded_at,'responded_channel',o.responded_channel,'server_time',clock_timestamp());
end;$$;
create function public.service_lead_offer_link(p_token_hash text,p_accept boolean default null)
returns jsonb language sql security invoker set search_path='' as $$select private.lead_offer_link(p_token_hash,p_accept)$$;

revoke all on function private.issue_lead_offer_tokens(uuid,text,text),public.service_issue_lead_offer_tokens(uuid,text,text),private.lead_offer_link(text,boolean),public.service_lead_offer_link(text,boolean) from public,anon,authenticated;
grant execute on function private.issue_lead_offer_tokens(uuid,text,text),public.service_issue_lead_offer_tokens(uuid,text,text),private.lead_offer_link(text,boolean),public.service_lead_offer_link(text,boolean) to service_role;
alter function private.decide_lead_offer(uuid,text,boolean,text) owner to crm_workflow_executor;
alter function private.lead_offer_link(text,boolean) owner to crm_workflow_executor;
revoke create on schema private from crm_workflow_executor;
revoke crm_workflow_executor from postgres;
