revoke all on table public.sms_consent from authenticated;
grant select,insert,update,delete on table public.sms_consent to authenticated;

alter policy sms_messages_office_select on public.sms_messages to authenticated;
alter policy sms_messages_owner_correct_linkage on public.sms_messages to authenticated;
alter policy sms_messages_technician_select on public.sms_messages to authenticated;

alter policy wa_notifications_admin_delete on public.wa_notifications to authenticated;
alter policy wa_notifications_office_insert on public.wa_notifications to authenticated;
alter policy wa_notifications_office_select on public.wa_notifications to authenticated;
alter policy wa_notifications_office_update on public.wa_notifications to authenticated;
alter policy wa_notifications_owner_delete on public.wa_notifications to authenticated;
alter policy wa_notifications_owner_insert on public.wa_notifications to authenticated;
alter policy wa_notifications_recipient_select on public.wa_notifications to authenticated;
alter policy wa_notifications_recipient_update on public.wa_notifications to authenticated;
