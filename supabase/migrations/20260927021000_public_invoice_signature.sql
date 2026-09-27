-- Secure customer acknowledgement/signature for public invoice pages.
create or replace function public.sign_public_invoice(
  p_invoice_id text,
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
  v_token public.public_invoice_access_tokens;
  v_inv public.invoices;
  v_signed_at timestamptz := now();
  v_audit_id text;
begin
  if nullif(btrim(coalesce(p_invoice_id,'')),'') is null
     or p_access_token !~ '^[0-9a-fA-F]{64}$' then raise exception 'Invalid invoice access token'; end if;
  if nullif(btrim(coalesce(p_signer_name,'')),'') is null then raise exception 'Signer name is required'; end if;
  if p_signature_data_url !~ '^data:image/(png|jpeg|webp);base64,' then raise exception 'Signature must be a supported image data URL'; end if;
  if octet_length(p_signature_data_url)>750000 then raise exception 'Signature image is too large'; end if;

  v_hash:=encode(extensions.digest(lower(p_access_token),'sha256'),'hex');
  select * into v_token from public.public_invoice_access_tokens
   where invoice_id=p_invoice_id and token_hash=v_hash and revoked_at is null and expires_at>now()
   order by created_at desc limit 1;
  if not found then raise exception 'Invoice access expired or invalid'; end if;

  select * into v_inv from public.invoices where id=p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Invoice not found'; end if;

  if coalesce(v_inv.app_data->'customerInvoiceSignature','{}'::jsonb) <> '{}'::jsonb then
    return jsonb_build_object('ok',true,'already_signed',true,'signed_at',v_inv.app_data->'customerInvoiceSignature'->>'at');
  end if;

  update public.invoices
  set app_data=jsonb_set(coalesce(app_data,'{}'::jsonb),'{customerInvoiceSignature}',
    jsonb_build_object('name',btrim(p_signer_name),'dataUrl',p_signature_data_url,'at',v_signed_at,
      'source','public_invoice','consentVersion',coalesce(nullif(btrim(p_consent_version),''),'v1')),true)
  where id=v_inv.id;

  v_audit_id:='audit_'||replace(gen_random_uuid()::text,'-','');
  insert into public.audit_log(id,action,summary,entity_type,entity_id,related_type,related_id,source,priority,read,created_by_team_id,created_at)
  values(v_audit_id,'invoice_signed_remote','Customer signed invoice remotely','invoice',v_inv.id,'public_invoice_access_token',v_token.id::text,'system','normal',false,v_token.created_by_team_id,v_signed_at);

  return jsonb_build_object('ok',true,'already_signed',false,'signed_at',v_signed_at);
end;
$function$;

revoke all on function public.sign_public_invoice(text,text,text,text,text) from public;
grant execute on function public.sign_public_invoice(text,text,text,text,text) to anon, authenticated, service_role;
