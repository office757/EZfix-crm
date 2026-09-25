-- Fix AI receptionist human-followup task lifecycle and preserve callback metadata.

create or replace function public.enqueue_ai_receptionist_human_followup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested boolean := false;
  transfer_status text;
  callback_phone text;
  task_key text;
begin
  requested := lower(coalesce(new.lead_extraction->>'human_transfer_requested','false')) = 'true';
  if not requested then
    return new;
  end if;

  transfer_status := coalesce(nullif(new.lead_extraction->>'transfer_status',''), 'requested_unfulfilled');
  task_key := 'ai_human_callback_' || new.id;

  if transfer_status = 'forwarded' then
    update public.tasks
       set status = 'done',
           updated_at = now()
     where id = task_key
       and status in ('open','in_progress','completed');
    return new;
  end if;

  callback_phone := coalesce(nullif(new.lead_extraction->>'phone',''), nullif(new.remote_number,''));

  insert into public.tasks (
    id, title, customer_id, due_date, priority, status, app_data, created_at, updated_at
  ) values (
    task_key,
    'Human callback requested from AI receptionist',
    new.customer_id,
    current_date,
    'high',
    'open',
    jsonb_build_object(
      'source', 'ai_receptionist',
      'call_id', new.id,
      'provider_call_id', new.provider_call_id,
      'lead_id', new.lead_id,
      'callback_phone', callback_phone,
      'transfer_status', transfer_status,
      'transfer_number', '+17742445533'
    ),
    now(),
    now()
  )
  on conflict (id) do update
     set customer_id = coalesce(excluded.customer_id, public.tasks.customer_id),
         priority = 'high',
         updated_at = now()
   where public.tasks.status in ('open','in_progress');

  return new;
end;
$$;

revoke all on function public.enqueue_ai_receptionist_human_followup() from public;

-- Normalize any legacy task state written by the previous trigger implementation.
update public.tasks
   set status='done',
       updated_at=now()
 where id like 'ai_human_callback_%'
   and status='completed';
