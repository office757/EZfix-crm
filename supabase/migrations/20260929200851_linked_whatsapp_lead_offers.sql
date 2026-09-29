alter table public.wa_linked_sends add column lead_offer_id uuid references public.lead_offers(id);
create unique index wa_linked_sends_offer_unique on public.wa_linked_sends(lead_offer_id) where lead_offer_id is not null;
create function public.service_queue_wa_lead_offer(p_offer_id uuid,p_body text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.lead_offers; t public.team; actor uuid; existing public.wa_linked_sends;
begin
 select * into o from public.lead_offers where id=p_offer_id for update;
 if not found or o.status<>'pending' or o.expires_at<=clock_timestamp() then return jsonb_build_object('status','suppressed');end if;
 select * into existing from public.wa_linked_sends where lead_offer_id=o.id;
 if found then return jsonb_build_object('status',existing.state,'message_id',existing.id);end if;
 select * into t from public.team where id=o.technician_id and status='active';
 if not found then return jsonb_build_object('status','failed');end if;
 if t.app_data->'notify_prefs'->>'newLead'='false' then return jsonb_build_object('status','suppressed');end if;
 if coalesce(t.app_data->>'whatsapp_opt_in','false')<>'true' then return jsonb_build_object('status','blocked_no_opt_in');end if;
 if coalesce(t.app_data->>'whatsapp_number','') !~ '^\+[1-9][0-9]{7,14}$' then return jsonb_build_object('status','failed');end if;
 if not exists(select 1 from public.wa_linked_status where id='primary' and state='ready' and updated_at>clock_timestamp()-interval '45 seconds') then return jsonb_build_object('status','not_connected');end if;
 select auth_user_id into actor from public.team where status='active' and auth_user_id is not null and (id=o.created_by or role='owner') order by (id=o.created_by) desc nulls last,id limit 1;
 if actor is null then return jsonb_build_object('status','failed');end if;
 insert into public.wa_linked_sends(id,created_by,to_phone,body,lead_offer_id) values(o.id,actor,t.app_data->>'whatsapp_number',p_body,o.id);
 return jsonb_build_object('status','queued','message_id',o.id,'provider','linked_device');
end $$;
revoke all on function public.service_queue_wa_lead_offer(uuid,text) from public,anon,authenticated;
grant execute on function public.service_queue_wa_lead_offer(uuid,text) to service_role;
create or replace function public.service_claim_wa_linked_send(p_worker_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare command public.wa_linked_sends;
begin
 update public.wa_linked_sends s set state=case when s.state='processing' then 'unconfirmed' else 'cancelled' end,updated_at=now()
 where s.lead_offer_id is not null and s.state in ('queued','processing') and not exists(select 1 from public.lead_offers o join public.team t on t.id=o.technician_id where o.id=s.lead_offer_id and o.status='pending' and o.expires_at>clock_timestamp() and t.status='active' and t.app_data->>'whatsapp_opt_in'='true' and coalesce(t.app_data->'notify_prefs'->>'newLead','true')<>'false');
 select * into command from public.wa_linked_sends where (state='processing' and worker_id=p_worker_id) or state='queued'
 order by case when state='processing' then 0 else 1 end,created_at limit 1 for update skip locked;
 if not found then return null;end if;
 update public.wa_linked_sends set state='processing',worker_id=p_worker_id,updated_at=now() where id=command.id;
 return jsonb_build_object('request_id',command.id,'to',command.to_phone,'body',command.body);
end $$;
create function public.sync_wa_lead_offer_result() returns trigger language plpgsql security invoker set search_path='' as $$
declare result text;
begin
 if new.lead_offer_id is null or new.state not in ('submitted','unconfirmed','not_registered','cancelled') then return new;end if;
 result:=case new.state when 'submitted' then 'sent' when 'cancelled' then 'suppressed' else 'failed' end;
 update public.wa_notifications set status=result,provider='linked_device',provider_message_id=new.provider_id,app_data=coalesce(app_data,'{}')||jsonb_build_object('status',result,'bridge_state',new.state),failure_reason=case when new.state='unconfirmed' then 'Provider outcome unknown. Do not resend automatically.' when new.state='not_registered' then 'Recipient is not registered on WhatsApp.' else null end where id='offer_'||new.lead_offer_id;
 update public.lead_offers set notification_status=jsonb_set(notification_status,'{whatsapp}',jsonb_build_object('status',case when new.state='unconfirmed' then 'unconfirmed' else result end,'provider','linked_device','message_id','offer_'||new.lead_offer_id)) where id=new.lead_offer_id;
 return new;
end $$;
revoke all on function public.sync_wa_lead_offer_result() from public,anon,authenticated;
create trigger wa_lead_offer_result after update of state on public.wa_linked_sends for each row when (old.state is distinct from new.state) execute function public.sync_wa_lead_offer_result();
