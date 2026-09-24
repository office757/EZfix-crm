update public.sms_messages m
set customer_id=j.customer_id,updated_at=now()
from public.jobs j
where m.message_type='technician_assignment'
  and m.customer_id is null
  and j.deleted_at is null
  and (m.provider_event_ids->>0)=('tech_assignment:'||j.id||':'||j.technician_id);

create unique index if not exists sms_messages_technician_assignment_dedupe_uidx
on public.sms_messages ((provider_event_ids->>0))
where message_type='technician_assignment' and nullif(provider_event_ids->>0,'') is not null;
