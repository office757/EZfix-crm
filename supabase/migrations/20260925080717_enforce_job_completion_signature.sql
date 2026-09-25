-- Enforce customer signature before a Job may enter completed status.

create or replace function public.enforce_job_completion_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_signature jsonb;
begin
  if new.status = 'completed' then
    v_signature := coalesce(new.app_data, '{}'::jsonb)->'completion_signature';

    if v_signature is null
       or nullif(btrim(coalesce(v_signature->>'dataUrl','')), '') is null
       or nullif(btrim(coalesce(v_signature->>'name','')), '') is null
       or coalesce((v_signature->>'at')::numeric,0) <= 0
    then
      raise exception 'Job completion requires a customer signature'
        using errcode='23514';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_job_completion_signature()
from public, anon, authenticated;
grant execute on function public.enforce_job_completion_signature() to service_role;

drop trigger if exists jobs_require_completion_signature on public.jobs;
create trigger jobs_require_completion_signature
before insert or update of status, app_data on public.jobs
for each row
execute function public.enforce_job_completion_signature();
