CREATE OR REPLACE FUNCTION public.protect_wa_provider_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if current_user <> 'service_role' then
    if new.status is distinct from old.status
       or new.provider is distinct from old.provider
       or new.provider_message_id is distinct from old.provider_message_id
       or new.recipient_phone is distinct from old.recipient_phone
       or new.failure_reason is distinct from old.failure_reason
       or new.accepted_at is distinct from old.accepted_at
       or new.sent_at is distinct from old.sent_at
       or new.delivered_at is distinct from old.delivered_at
       or new.read_at is distinct from old.read_at
       or new.failed_at is distinct from old.failed_at
       or new.attempt_count is distinct from old.attempt_count then
      raise exception 'WhatsApp provider delivery fields are server-managed';
    end if;
  end if;
  return new;
end;
$function$;
