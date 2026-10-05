-- Durable, future-only payment events. No backfill or money movement.
create table public.owner_payment_events (
 id uuid primary key default gen_random_uuid(),
 invoice_id text not null references public.invoices(id) on delete cascade,
 payment_key text not null,
 created_at timestamptz not null default now(),
 unique(invoice_id,payment_key)
);
alter table public.owner_payment_events enable row level security;
revoke all on public.owner_payment_events from public,anon,authenticated;
grant all on public.owner_payment_events to service_role;
create table public.owner_payment_push_queue (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.owner_payment_events(id) on delete cascade,
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 team_id text not null references public.team(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sending','accepted','unconfirmed','failed','skipped','expired')),
 created_at timestamptz not null default now(), claimed_at timestamptz,completed_at timestamptz,
 unique(event_id,subscription_id)
);
alter table public.owner_payment_push_queue enable row level security;
revoke all on public.owner_payment_push_queue from public,anon,authenticated;
grant all on public.owner_payment_push_queue to service_role;
create index owner_payment_push_pending_idx on public.owner_payment_push_queue(created_at) where status='pending';
create index owner_payment_push_subscription_idx on public.owner_payment_push_queue(subscription_id);
create index owner_payment_push_team_idx on public.owner_payment_push_queue(team_id);
create function private.is_received_owner_payment(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(case when jsonb_typeof(coalesce(p->'appliedAmount',p->'amount'))='number' then coalesce(p->>'appliedAmount',p->>'amount')::numeric>0 else false end
 and lower(coalesce(p->>'type','payment')) not in ('refund','adjustment')
 and lower(coalesce(p->>'status','')) in ('','completed','paid','succeeded','payment')
 and coalesce(nullif(p->>'squarePaymentId',''),nullif(p->>'externalPaymentId',''),nullif(p->>'id','')) is not null,false);
$$;
revoke all on function private.is_received_owner_payment(jsonb) from public,anon,authenticated;
grant execute on function private.is_received_owner_payment(jsonb) to service_role;
create function private.queue_owner_payment_push() returns trigger
language plpgsql security definer set search_path='' as $$
declare p jsonb;k text;eid uuid;prior jsonb:='[]'::jsonb;added integer:=0;token text;
begin
 if new.deleted_at is not null or new.app_data->'is_demo'='true'::jsonb then return new;end if;
 if tg_op='UPDATE' then prior:=coalesce(old.payments,'[]'::jsonb);end if;
 if jsonb_typeof(new.payments)<>'array' then return new;end if;
 for p in select value from jsonb_array_elements(coalesce(new.payments,'[]'::jsonb)) loop
  if not private.is_received_owner_payment(p) then continue;end if;
  k:=coalesce(nullif(p->>'squarePaymentId',''),nullif(p->>'externalPaymentId',''),nullif(p->>'id',''));
  if exists(select 1 from jsonb_array_elements(prior) x where coalesce(nullif(x->>'squarePaymentId',''),nullif(x->>'externalPaymentId',''),nullif(x->>'id',''))=k and private.is_received_owner_payment(x)) then continue;end if;
  eid:=null;
  insert into public.owner_payment_events(invoice_id,payment_key) values(new.id,k) on conflict(invoice_id,payment_key) do nothing returning id into eid;
  if eid is null then continue;end if;
  insert into public.owner_payment_push_queue(event_id,subscription_id,team_id)
   select eid,s.id,t.id from public.push_subscriptions s join public.team t on t.id=s.team_id
   where t.role='owner' and t.status='active' and t.auth_user_id is not null
   on conflict(event_id,subscription_id) do nothing;
  added:=added+1;
 end loop;
 -- Async request is sent only after commit. Cron recovers missed dispatches.
 if added>0 and exists(select 1 from public.owner_payment_push_queue where status='pending') then
  select decrypted_secret into token from vault.decrypted_secrets where name='ezfix_call_sync_cron_token' limit 1;
  if token is not null then
   begin
    perform net.http_post(url:='https://fylbalenuqpovwncwbah.supabase.co/functions/v1/owner-payment-push',headers:=jsonb_build_object('Content-Type','application/json','x-ezfix-cron-token',token),body:='{}'::jsonb,timeout_milliseconds:=55000);
   exception when others then null; -- A transient dispatcher failure must not reject a recorded payment.
   end;
  end if;
 end if;
 return new;
end;$$;
revoke all on function private.queue_owner_payment_push() from public,anon,authenticated;
create trigger queue_owner_payment_push after insert or update of payments on public.invoices for each row execute function private.queue_owner_payment_push();
create function public.service_claim_owner_payment_push() returns table(id uuid,event_id uuid,invoice_id text,payment_key text,subscription_id uuid,team_id text,subscription jsonb,expires_at timestamptz)
language plpgsql security invoker set search_path='' as $$
begin
 update public.owner_payment_push_queue q set status='unconfirmed',completed_at=now() where q.status='sending' and q.claimed_at<now()-interval '5 minutes';
 update public.owner_payment_push_queue q set status='expired',completed_at=now() where q.status='pending' and q.created_at<now()-interval '24 hours';
 update public.owner_payment_push_queue q set status='skipped',completed_at=now() where q.status='pending' and not exists(
  select 1 from public.team t join public.push_subscriptions s on s.team_id=t.id join public.owner_payment_events e on e.id=q.event_id join public.invoices i on i.id=e.invoice_id
  where s.id=q.subscription_id and t.id=q.team_id and t.role='owner' and t.status='active' and t.auth_user_id is not null and i.deleted_at is null
  and exists(select 1 from jsonb_array_elements(coalesce(i.payments,'[]'::jsonb)) p where coalesce(nullif(p->>'squarePaymentId',''),nullif(p->>'externalPaymentId',''),nullif(p->>'id',''))=e.payment_key and private.is_received_owner_payment(p))
 );
 return query with picked as(select q.id from public.owner_payment_push_queue q where q.status='pending' order by q.created_at,q.id for update skip locked limit 20), claimed as(
  update public.owner_payment_push_queue q set status='sending',claimed_at=now() from picked p where q.id=p.id returning q.*
 ) select c.id,c.event_id,e.invoice_id,e.payment_key,c.subscription_id,c.team_id,s.subscription,c.created_at+interval '24 hours'
 from claimed c join public.push_subscriptions s on s.id=c.subscription_id and s.team_id=c.team_id join public.owner_payment_events e on e.id=c.event_id;
end;$$;
revoke all on function public.service_claim_owner_payment_push() from public,anon,authenticated;
grant execute on function public.service_claim_owner_payment_push() to service_role;
select cron.schedule('ezfix-owner-payment-push','* * * * *',$cmd$
 select net.http_post(url:='https://fylbalenuqpovwncwbah.supabase.co/functions/v1/owner-payment-push',headers:=jsonb_build_object('Content-Type','application/json','x-ezfix-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='ezfix_call_sync_cron_token' limit 1)),body:='{}'::jsonb,timeout_milliseconds:=55000)
 where exists(select 1 from public.owner_payment_push_queue where status='pending' or (status='sending' and claimed_at<now()-interval '5 minutes'));
$cmd$);
