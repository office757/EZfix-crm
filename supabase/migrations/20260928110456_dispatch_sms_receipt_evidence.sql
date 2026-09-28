-- Only the authenticated SMS sender records receipt correlation; delivery comes
-- from the existing provider webhook. Client flags never count as delivery.
create table public.invoice_sms_receipts (
 sms_message_id text primary key references public.sms_messages(id),
 invoice_id text not null references public.invoices(id),
 created_by_team_id text references public.team(id),
 created_at timestamptz not null default now()
);
create index invoice_sms_receipts_invoice_idx on public.invoice_sms_receipts(invoice_id);
alter table public.invoice_sms_receipts enable row level security;
revoke all on public.invoice_sms_receipts from public,anon,authenticated;
grant select,insert on public.invoice_sms_receipts to service_role;

create or replace function private.job_payment_receipt_ready(p_job_id text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.invoices i cross join lateral (
  select coalesce(sum(coalesce(nullif(x->>'qty','')::numeric,1)*coalesce(nullif(x->>'rate','')::numeric,0)),0) subtotal,
  coalesce(sum(case when x->>'taxable'='false' then 0 else coalesce(nullif(x->>'qty','')::numeric,1)*coalesce(nullif(x->>'rate','')::numeric,0) end),0) taxable from jsonb_array_elements(coalesce(i.items,'[]')) x
 ) s cross join lateral (select least(greatest(coalesce(i.discount,0),0),greatest(s.subtotal,0)) d) d
 cross join lateral (select round(s.subtotal-d.d+round(s.taxable*case when s.subtotal>0 then (s.subtotal-d.d)/s.subtotal else 1 end*coalesce(i.tax_rate,0)/100,2),2) total) t
 where i.job_id=p_job_id and i.deleted_at is null and t.total>0
 and (select coalesce(sum(greatest(0,coalesce(nullif(p->>'appliedAmount','')::numeric,nullif(p->>'amount','')::numeric,0))),0) from jsonb_array_elements(coalesce(i.payments,'[]')) p)+0.005>=t.total
 and (
  exists(select 1 from public.email_delivery_events e where e.invoice_id=i.id and e.provider_message_id=i.app_data->>'receiptEmailProviderMessageId' and e.event_type='email.delivered' and exists(select 1 from public.audit_log a where a.entity_type='invoices' and a.entity_id=i.id and a.action='receipt_email_accepted' and a.source='provider' and a.related_id=e.provider_message_id))
  or exists(select 1 from public.invoice_sms_receipts r join public.sms_messages m on m.id=r.sms_message_id where r.invoice_id=i.id and m.direction='outbound' and m.provider='inkbox' and m.provider_message_id is not null and m.provider_status='delivered' and m.delivered_at is not null and m.failed_at is null)
 )
 );$$;
