-- Version the public invoice token boundary that already exists in production.
-- The token table intentionally has RLS enabled with no direct client policies:
-- only the RPCs below may read/write it.

create table if not exists public.public_invoice_access_tokens (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null references public.invoices(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by_team_id text null references public.team(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);

alter table public.public_invoice_access_tokens enable row level security;

create index if not exists public_invoice_access_tokens_invoice_idx
  on public.public_invoice_access_tokens(invoice_id, expires_at desc)
  where revoked_at is null;

revoke all on table public.public_invoice_access_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.public_invoice_access_tokens to service_role;

create or replace function public.issue_public_invoice_access_token(p_invoice_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_team text;
  v_inv public.invoices;
  v_token text;
  v_hash text;
  v_expires timestamptz := now() + interval '180 days';
  v_allowed boolean := false;
begin
  v_team := public.current_team_id();
  if v_team is null then raise exception 'Active team session required'; end if;

  select * into v_inv
  from public.invoices
  where id=p_invoice_id and deleted_at is null
  limit 1;

  if not found then raise exception 'Invoice not found'; end if;

  v_allowed := public.has_app_role(array['owner','admin','dispatcher','office']::text[]);
  if not v_allowed and public.has_app_role(array['technician']::text[]) then
    v_allowed := coalesce(v_inv.app_data->>'createdByTechnicianId','')=v_team
      or exists(
        select 1
        from public.jobs j
        where j.id=v_inv.job_id
          and j.deleted_at is null
          and j.technician_id=v_team
      );
  end if;

  if not v_allowed then
    raise exception 'Invoice is not available to this team member';
  end if;

  v_token := encode(extensions.gen_random_bytes(32),'hex');
  v_hash := encode(extensions.digest(v_token,'sha256'),'hex');

  insert into public.public_invoice_access_tokens(
    invoice_id,token_hash,expires_at,created_by_team_id
  )
  values(p_invoice_id,v_hash,v_expires,v_team);

  return jsonb_build_object(
    'token',v_token,
    'expires_at',v_expires,
    'invoice_id',p_invoice_id
  );
end;
$function$;

revoke all on function public.issue_public_invoice_access_token(text) from public, anon;
grant execute on function public.issue_public_invoice_access_token(text) to authenticated, service_role;

create or replace function public.get_public_invoice_payment_page(
  p_invoice_id text,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text;
  v_ok boolean;
  v_result jsonb;
begin
  if nullif(btrim(coalesce(p_invoice_id,'')),'') is null
     or p_access_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Invalid invoice access token';
  end if;

  v_hash := encode(extensions.digest(lower(p_access_token),'sha256'),'hex');

  select exists(
    select 1
    from public.public_invoice_access_tokens t
    where t.invoice_id=p_invoice_id
      and t.token_hash=v_hash
      and t.revoked_at is null
      and t.expires_at>now()
  ) into v_ok;

  if not v_ok then
    raise exception 'Invoice access expired or invalid';
  end if;

  select jsonb_build_object(
    'id',i.id,
    'number',i.number,
    'customer_name',i.customer_name,
    'date',i.date,
    'due_term',i.due_term,
    'items',coalesce(i.items,'[]'::jsonb),
    'tax_rate',i.tax_rate,
    'discount',i.discount,
    'payments',coalesce(i.payments,'[]'::jsonb),
    'payment_link',i.payment_link,
    'payment_provider',i.payment_provider
  )
  into v_result
  from public.invoices i
  where i.id=p_invoice_id
    and i.deleted_at is null
  limit 1;

  return v_result;
end;
$function$;

revoke all on function public.get_public_invoice_payment_page(text,text) from public;
grant execute on function public.get_public_invoice_payment_page(text,text) to anon, authenticated, service_role;

-- The legacy single-argument public page must never be a public endpoint.
revoke all on function public.get_public_invoice_payment_page(text) from public, anon, authenticated;
