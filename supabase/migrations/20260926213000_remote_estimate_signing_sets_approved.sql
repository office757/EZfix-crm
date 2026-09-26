-- A successfully completed remote estimate signature is customer approval.
-- Keep the status transition atomic with signature persistence.
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
  where estimate_id = p_estimate_id and token_hash = v_hash
  for update;
  if not found then raise exception 'Estimate signing link expired or invalid'; end if;

  select * into v_est
  from public.estimates
  where id = p_estimate_id and deleted_at is null
  for update;
  if not found then raise exception 'Estimate not found'; end if;

  if v_token.used_at is not null then
    v_existing_hash := coalesce(v_est.signature->>'snapshotHash', '');
    if coalesce(v_est.signature->>'source','') = 'remote'
       and v_existing_hash = v_token.estimate_snapshot_hash then
      return jsonb_build_object('ok',true,'estimate_id',v_est.id,'already_signed',true,'signed_at',v_est.signature->>'at');
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
        'name',btrim(p_signer_name),'dataUrl',p_signature_data_url,
        'at',floor(extract(epoch from v_signed_at)*1000),
        'doc','estimate_approval','source','remote',
        'snapshotHash',v_token.estimate_snapshot_hash,
        'issuedRowVersion',v_token.issued_row_version,
        'consentVersion',coalesce(nullif(btrim(p_consent_version),''),'v1')
      ),
      status = 'approved'
  where id = v_est.id;

  update public.public_estimate_signing_tokens set used_at=v_signed_at where id=v_token.id;

  v_audit_id := 'audit_' || replace(gen_random_uuid()::text,'-','');
  insert into public.audit_log(
    id,action,summary,entity_type,entity_id,related_type,related_id,
    source,priority,read,created_by_team_id,created_at
  ) values (
    v_audit_id,'estimate_signed_remote','Customer signed estimate remotely',
    'estimate',v_est.id,'estimate_signing_token',v_token.id::text,
    'system','normal',false,v_token.created_by_team_id,v_signed_at
  );

  return jsonb_build_object(
    'ok',true,'estimate_id',v_est.id,'already_signed',false,
    'signed_at',v_signed_at,'snapshot_hash',v_token.estimate_snapshot_hash,
    'status','approved'
  );
end;
$function$;

revoke all on function public.sign_public_estimate(text,text,text,text,text) from public;
grant execute on function public.sign_public_estimate(text,text,text,text,text) to anon, authenticated, service_role;
