-- Remote Estimate Signing
-- Prepared on a non-production branch. Validate in BEGIN/ROLLBACK before deployment.

create table if not exists public.public_estimate_signing_tokens (
  id uuid primary key default gen_random_uuid(),
  estimate_id text not null references public.estimates(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by_team_id text null references public.team(id),
  issued_row_version bigint not null,
  estimate_snapshot_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz null,
  revoked_at timestamptz null
);

alter table public.public_estimate_signing_tokens enable row level security;
revoke all on table public.public_estimate_signing_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.public_estimate_signing_tokens to service_role;

create index if not exists public_estimate_signing_tokens_estimate_idx
  on public.public_estimate_signing_tokens(estimate_id, expires_at desc)
  where revoked_at is null and used_at is null;

create or replace function public.estimate_signing_snapshot_hash(p_estimate_id text)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select encode(
    extensions.digest(
      jsonb_build_object(
        'id', e.id,
        'number', e.number,
        'customer_name', e.customer_name,
        'customer_phone', e.customer_phone,
        'customer_address', e.customer_address,
        'customer_email', e.customer_email,
        'items', coalesce(e.items, '[]'::jsonb),
        'tax_rate', e.tax_rate,
        'discount', e.discount,
        'deposit_required', e.deposit_required,
        'due_term', e.due_term,
        'notes', e.notes
      )::text,
      'sha256'
    ),
    'hex'
  )
  from public.estimates e
  where e.id = p_estimate_id
    and e.deleted_at is null
  limit 1
$function$;

revoke all on function public.estimate_signing_snapshot_hash(text) from public, anon, authenticated;
grant execute on function public.estimate_signing_snapshot_hash(text) to service_role;

create or replace function public.issue_public_estimate_signing_token(p_estimate_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_team text := public.current_team_id();
  v_est public.estimates;
  v_token text;
  v_hash text;
  v_snapshot_hash text;
  v_expires timestamptz := now() + interval '7 days';
  v_allowed boolean := false;
begin
  if v_team is null then
    raise exception 'Active team session required';
  end if;

  select * into v_est
  from public.estimates
  where id = p_estimate_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Estimate not found';
  end if;

  v_allowed := public.has_app_role(array['owner','admin','dispatcher','office']::text[]);

  if not v_allowed and public.has_app_role(array['technician']::text[]) then
    v_allowed := exists (
      select 1
      from public.jobs j
      where j.deleted_at is null
        and j.technician_id = v_team
        and (j.estimate_id = v_est.id or j.id = v_est.converted_job_id)
    );
  end if;

  if not v_allowed then
    raise exception 'Estimate is not available to this team member';
  end if;

  v_snapshot_hash := public.estimate_signing_snapshot_hash(v_est.id);
  if v_snapshot_hash is null then
    raise exception 'Estimate snapshot could not be created';
  end if;

  update public.public_estimate_signing_tokens
  set revoked_at = now()
  where estimate_id = v_est.id
    and revoked_at is null
    and used_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(lower(v_token), 'sha256'), 'hex');

  insert into public.public_estimate_signing_tokens(
    estimate_id, token_hash, expires_at, created_by_team_id,
    issued_row_version, estimate_snapshot_hash
  ) values (
    v_est.id, v_hash, v_expires, v_team,
    v_est.row_version, v_snapshot_hash
  );

  return jsonb_build_object(
    'estimate_id', v_est.id,
    'token', v_token,
    'expires_at', v_expires,
    'issued_row_version', v_est.row_version
  );
end;
$function$;

revoke all on function public.issue_public_estimate_signing_token(text) from public, anon;
grant execute on function public.issue_public_estimate_signing_token(text) to authenticated, service_role;

create or replace function public.get_public_estimate_signing_page(
  p_estimate_id text,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text;
  v_token public.public_estimate_signing_tokens;
  v_est public.estimates;
  v_current_hash text;
begin
  if nullif(btrim(coalesce(p_estimate_id,'')), '') is null
     or p_access_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Invalid estimate access token';
  end if;

  v_hash := encode(extensions.digest(lower(p_access_token), 'sha256'), 'hex');

  select * into v_token
  from public.public_estimate_signing_tokens
  where estimate_id = p_estimate_id
    and token_hash = v_hash
    and revoked_at is null
    and used_at is null
    and expires_at > now()
  limit 1;

  if not found then
    raise exception 'Estimate signing link expired or invalid';
  end if;

  select * into v_est
  from public.estimates
  where id = p_estimate_id
    and deleted_at is null
  limit 1;

  if not found then
    raise exception 'Estimate not found';
  end if;

  v_current_hash := public.estimate_signing_snapshot_hash(v_est.id);
  if v_est.row_version <> v_token.issued_row_version
     or v_current_hash <> v_token.estimate_snapshot_hash then
    raise exception 'Estimate changed after this signing link was issued';
  end if;

  return jsonb_build_object(
    'id', v_est.id,
    'number', v_est.number,
    'customer_name', v_est.customer_name,
    'customer_phone', v_est.customer_phone,
    'customer_address', v_est.customer_address,
    'customer_email', v_est.customer_email,
    'date', v_est.date,
    'due_term', v_est.due_term,
    'items', coalesce(v_est.items, '[]'::jsonb),
    'tax_rate', v_est.tax_rate,
    'discount', v_est.discount,
    'deposit_required', v_est.deposit_required,
    'notes', v_est.notes,
    'status', v_est.status,
    'already_signed', coalesce(v_est.signature, '{}'::jsonb) <> '{}'::jsonb
  );
end;
$function$;

revoke all on function public.get_public_estimate_signing_page(text,text) from public;
grant execute on function public.get_public_estimate_signing_page(text,text) to anon, authenticated, service_role;

create or replace function public.sign_public_estimate(
  p_estimate_id text,
  p_access_token text,
  p_signer_name text,
  p_signature_data_url text,
  p_consent_version text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text;
  v_token public.public_estimate_signing_tokens;
  v_est public.estimates;
  v_current_hash text;
  v_signed_at timestamptz := now();
  v_existing_hash text;
  v_audit_id text;
begin
  if nullif(btrim(coalesce(p_estimate_id,'')), '') is null
     or p_access_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Invalid estimate access token';
  end if;
  if nullif(btrim(coalesce(p_signer_name,'')), '') is null then
    raise exception 'Signer name is required';
  end if;
  if p_signature_data_url !~ '^data:image/(png|jpeg|webp);base64,' then
    raise exception 'Signature must be a supported image data URL';
  end if;
  if octet_length(p_signature_data_url) > 750000 then
    raise exception 'Signature image is too large';
  end if;

  v_hash := encode(extensions.digest(lower(p_access_token), 'sha256'), 'hex');

  select * into v_token
  from public.public_estimate_signing_tokens
  where estimate_id = p_estimate_id
    and token_hash = v_hash
  for update;

  if not found then
    raise exception 'Estimate signing link expired or invalid';
  end if;

  select * into v_est
  from public.estimates
  where id = p_estimate_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Estimate not found';
  end if;

  if v_token.used_at is not null then
    v_existing_hash := coalesce(v_est.signature->>'snapshotHash', '');
    if coalesce(v_est.signature->>'source','') = 'remote'
       and v_existing_hash = v_token.estimate_snapshot_hash then
      return jsonb_build_object(
        'ok', true,
        'estimate_id', v_est.id,
        'already_signed', true,
        'signed_at', v_est.signature->>'at'
      );
    end if;
    raise exception 'Estimate signing link already used';
  end if;

  if v_token.revoked_at is not null or v_token.expires_at <= now() then
    raise exception 'Estimate signing link expired or invalid';
  end if;

  v_current_hash := public.estimate_signing_snapshot_hash(v_est.id);
  if v_est.row_version <> v_token.issued_row_version
     or v_current_hash <> v_token.estimate_snapshot_hash then
    raise exception 'Estimate changed after this signing link was issued';
  end if;

  update public.estimates
  set signature = jsonb_build_object(
        'name', btrim(p_signer_name),
        'dataUrl', p_signature_data_url,
        'at', floor(extract(epoch from v_signed_at) * 1000),
        'doc', 'estimate_approval',
        'source', 'remote',
        'snapshotHash', v_token.estimate_snapshot_hash,
        'issuedRowVersion', v_token.issued_row_version,
        'consentVersion', coalesce(nullif(btrim(p_consent_version),''), 'v1')
      )
  where id = v_est.id;

  update public.public_estimate_signing_tokens
  set used_at = v_signed_at
  where id = v_token.id;

  v_audit_id := 'audit_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.audit_log(
    id, action, summary, entity_type, entity_id, related_type, related_id,
    source, priority, read, created_by_team_id, created_at
  ) values (
    v_audit_id,
    'estimate_signed_remote',
    'Customer signed estimate remotely',
    'estimate',
    v_est.id,
    'estimate_signing_token',
    v_token.id::text,
    'public_signing',
    'normal',
    false,
    v_token.created_by_team_id,
    v_signed_at
  );

  return jsonb_build_object(
    'ok', true,
    'estimate_id', v_est.id,
    'already_signed', false,
    'signed_at', v_signed_at,
    'snapshot_hash', v_token.estimate_snapshot_hash
  );
end;
$function$;

revoke all on function public.sign_public_estimate(text,text,text,text,text) from public;
grant execute on function public.sign_public_estimate(text,text,text,text,text) to anon, authenticated, service_role;

create or replace function public.invalidate_estimate_signature_on_commercial_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(old.signature, '{}'::jsonb) <> '{}'::jsonb
     and (
       new.customer_name is distinct from old.customer_name
       or new.customer_phone is distinct from old.customer_phone
       or new.customer_address is distinct from old.customer_address
       or new.customer_email is distinct from old.customer_email
       or new.items is distinct from old.items
       or new.tax_rate is distinct from old.tax_rate
       or new.discount is distinct from old.discount
       or new.deposit_required is distinct from old.deposit_required
       or new.due_term is distinct from old.due_term
       or new.notes is distinct from old.notes
     ) then
    new.signature := null;
    new.app_data := jsonb_set(
      coalesce(new.app_data, '{}'::jsonb),
      '{signatureInvalidation}',
      jsonb_build_object(
        'at', now(),
        'reason', 'commercial_fields_changed',
        'previousSignatureSource', old.signature->>'source',
        'previousSnapshotHash', old.signature->>'snapshotHash'
      ),
      true
    );

    update public.public_estimate_signing_tokens
    set revoked_at = coalesce(revoked_at, now())
    where estimate_id = old.id
      and used_at is null
      and revoked_at is null;
  end if;

  return new;
end;
$function$;

revoke all on function public.invalidate_estimate_signature_on_commercial_change() from public, anon, authenticated;
grant execute on function public.invalidate_estimate_signature_on_commercial_change() to service_role;

drop trigger if exists trg_invalidate_estimate_signature_on_commercial_change on public.estimates;
create trigger trg_invalidate_estimate_signature_on_commercial_change
before update on public.estimates
for each row
execute function public.invalidate_estimate_signature_on_commercial_change();
