begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team where role='owner' and status='active' and auth_user_id is not null limit 1),true);
set local role authenticated;
do $$
declare o public.lead_offers%rowtype;owner_uid text:=auth.uid()::text;tech_uid text;r jsonb;
begin
 select * into o from public.lead_offers where status='pending' order by created_at desc limit 1;
 if not found then raise exception 'Pending offer fixture required';end if;
 select auth_user_id::text into tech_uid from public.team where id=o.technician_id;
 perform set_config('request.jwt.claim.sub',tech_uid,true);
 begin perform public.cancel_pending_lead_offer(o.lead_id,o.id);raise exception 'TEST: technician cancelled';
 exception when others then if sqlerrm<>'Office access required' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',owner_uid,true);
 r:=public.cancel_pending_lead_offer(o.lead_id,o.id);
 if r->>'status'<>'unassigned' then raise exception 'TEST: not unassigned';end if;
 if not exists(select 1 from public.lead_offers where id=o.id and status='cancelled') then raise exception 'TEST: not cancelled';end if;
 begin perform public.cancel_pending_lead_offer(o.lead_id,o.id);raise exception 'TEST: repeated cancellation';
 exception when others then if sqlerrm<>'Offer changed. Refresh the lead before trying again' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',tech_uid,true);
 r:=public.respond_lead_offer(o.id,true);
 if r->>'status'<>'cancelled' then raise exception 'TEST: late acceptance not rejected';end if;
end;$$;
rollback;
