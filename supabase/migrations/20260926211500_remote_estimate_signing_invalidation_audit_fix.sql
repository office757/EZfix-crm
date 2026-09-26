-- Follow-up hardening discovered during live transactional QA.
-- Do not write signature invalidation metadata to estimates.app_data because app_data is owner-managed.
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
    update public.public_estimate_signing_tokens
    set revoked_at = coalesce(revoked_at, now())
    where estimate_id = old.id and used_at is null and revoked_at is null;
    insert into public.audit_log(
      id, action, summary, entity_type, entity_id, related_type, related_id,
      source, priority, read, created_by_team_id, created_at
    ) values (
      'audit_' || replace(gen_random_uuid()::text, '-', ''),
      'estimate_signature_invalidated',
      'Estimate signature invalidated because customer-visible commercial fields changed',
      'estimate', old.id, 'estimate', old.id, 'system', 'normal', false, null, now()
    );
  end if;
  return new;
end;
$function$;
revoke all on function public.invalidate_estimate_signature_on_commercial_change() from public, anon, authenticated;
grant execute on function public.invalidate_estimate_signature_on_commercial_change() to service_role;
