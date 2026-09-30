
create schema if not exists private;
create or replace function private.receipt_source(i public.invoices) returns text language sql immutable set search_path='' as $$
 select md5(jsonb_build_object('number',i.number,'customer_id',i.customer_id,'customer_name',i.customer_name,'customer_phone',i.customer_phone,'customer_address',i.customer_address,'customer_email',i.customer_email,'date',i.date,'items',i.items,'tax_rate',i.tax_rate,'discount',i.discount,'payments',i.payments,'deleted_at',i.deleted_at)::text)
$$;
create table public.customer_receipt_jobs (
 invoice_id text primary key references public.invoices(id) on delete cascade,
 source_hash text not null,
 status text not null default 'pending' check(status in ('pending','processing','ready','skipped')),
 lease_token uuid,
 lease_until timestamptz,
 attempts integer not null default 0,
 last_error text,
 updated_at timestamptz not null default now()
);
alter table public.customer_receipt_jobs enable row level security;
revoke all on public.customer_receipt_jobs from public, anon, authenticated;
grant all on public.customer_receipt_jobs to service_role;
create or replace function private.enqueue_customer_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare h text;
begin
 h:=private.receipt_source(new);
 if TG_OP='UPDATE' and h=private.receipt_source(old) then return new; end if;
 insert into public.customer_receipt_jobs(invoice_id,source_hash,status) values(new.id,h,'pending')
 on conflict(invoice_id) do update set source_hash=excluded.source_hash,status='pending',lease_token=null,lease_until=null,attempts=0,last_error=null,updated_at=now();
 if jsonb_array_length(coalesce(new.payments,'[]'::jsonb))>0 then
 begin
 perform net.http_post(url:='https://fylbalenuqpovwncwbah.supabase.co/functions/v1/archive-customer-receipts',
 headers:=jsonb_build_object('Content-Type','application/json','x-ezfix-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='ezfix_call_sync_cron_token' limit 1)),
 body:=jsonb_build_object('invoice_id',new.id),timeout_milliseconds:=120000);
 exception when others then null; end;
 end if;
 return new;
end $$;
revoke all on function private.enqueue_customer_receipt() from public, anon, authenticated;
create trigger enqueue_customer_receipt after insert or update on public.invoices for each row execute function private.enqueue_customer_receipt();
create or replace function public.claim_customer_receipts(p_invoice_id text default null)
returns table(invoice_id text,source_hash text,lease_token uuid) language sql set search_path='' as $$
 with picked as (
 select j.invoice_id from public.customer_receipt_jobs j where
 (p_invoice_id is null or j.invoice_id=p_invoice_id)
 and (j.status='pending' or (j.status='processing' and j.lease_until<now()))
 and (j.lease_until is null or j.lease_until<now())
 order by j.updated_at limit 5 for update skip locked
 ), claimed as (
 update public.customer_receipt_jobs j set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now()
 from picked p where j.invoice_id=p.invoice_id returning j.invoice_id,j.source_hash,j.lease_token
 ) select * from claimed
$$;
create or replace function public.finish_customer_receipt(p_invoice_id text,p_source_hash text,p_lease_token uuid,p_asset jsonb,p_skipped boolean default false)
returns boolean language plpgsql set search_path='' as $$
declare i public.invoices; j public.customer_receipt_jobs;
begin
 select * into i from public.invoices where id=p_invoice_id for update;
 select * into j from public.customer_receipt_jobs where invoice_id=p_invoice_id for update;
 if not found or j.source_hash<>p_source_hash or j.lease_token is distinct from p_lease_token or private.receipt_source(i)<>p_source_hash then return false; end if;
 if not p_skipped then
 update public.invoices set app_data=coalesce(app_data,'{}'::jsonb)||jsonb_build_object('customer_receipt_pdf',p_asset) where id=p_invoice_id;
 end if;
 update public.customer_receipt_jobs set status=case when p_skipped then 'skipped' else 'ready' end,lease_until=null,last_error=null,updated_at=now() where invoice_id=p_invoice_id;
 return true;
end $$;
revoke all on function public.claim_customer_receipts(text) from public,anon,authenticated;
revoke all on function public.finish_customer_receipt(text,text,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.claim_customer_receipts(text) to service_role;
grant execute on function public.finish_customer_receipt(text,text,uuid,jsonb,boolean) to service_role;
grant usage on schema private to service_role;
grant execute on function private.receipt_source(public.invoices) to service_role;
insert into public.customer_receipt_jobs(invoice_id,source_hash) select id,private.receipt_source(i) from public.invoices i where deleted_at is null;
select cron.schedule('ezfix-customer-receipt-archive','* * * * *',$cron$
 select net.http_post(url:='https://fylbalenuqpovwncwbah.supabase.co/functions/v1/archive-customer-receipts',
 headers:=jsonb_build_object('Content-Type','application/json','x-ezfix-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='ezfix_call_sync_cron_token' limit 1)),
 body:='{}'::jsonb,timeout_milliseconds:=120000);
$cron$);
