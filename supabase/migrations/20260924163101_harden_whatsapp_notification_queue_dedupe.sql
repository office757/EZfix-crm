set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

with ranked as (
  select id,
         row_number() over (
           partition by recipient_team_id,kind,entity_type,entity_id
           order by created_at desc,id desc
         ) as rn
  from public.wa_notifications
  where recipient_team_id is not null
    and kind is not null
    and entity_type is not null
    and entity_id is not null
)
update public.wa_notifications w
set status='suppressed',
    failure_reason='Duplicate notification suppressed before provider delivery',
    app_data=coalesce(w.app_data,'{}'::jsonb) ||
      jsonb_build_object(
        'status','suppressed',
        'failure_reason','Duplicate notification suppressed before provider delivery'
      ),
    updated_at=now()
from ranked r
where w.id=r.id and r.rn>1;

update public.wa_notifications w
set status='blocked_no_opt_in',
    failure_reason='WhatsApp assignment alerts require explicit technician opt-in',
    app_data=coalesce(w.app_data,'{}'::jsonb) ||
      jsonb_build_object(
        'status','blocked_no_opt_in',
        'failure_reason','WhatsApp assignment alerts require explicit technician opt-in'
      ),
    updated_at=now()
from public.team t
where w.recipient_team_id=t.id
  and w.status='pending'
  and coalesce((t.app_data->>'whatsapp_opt_in')::boolean,false)=false;

reset role;

create unique index if not exists wa_notifications_active_dedupe_uidx
on public.wa_notifications(recipient_team_id,kind,entity_type,entity_id)
where recipient_team_id is not null
  and kind is not null
  and entity_type is not null
  and entity_id is not null
  and coalesce(status,'pending') not in ('suppressed');