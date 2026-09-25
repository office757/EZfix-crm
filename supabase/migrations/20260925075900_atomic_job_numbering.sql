-- Make internal JOB numbering database-owned, atomic, and unique for active jobs.

create sequence if not exists public.job_number_seq as bigint start with 1 increment by 1 minvalue 1;

do $$
declare
  v_max bigint := 0;
begin
  select coalesce(max((regexp_match(job_number, '^JOB([0-9]+)$'))[1]::bigint),0)
    into v_max
  from public.jobs
  where job_number ~ '^JOB[0-9]+$';

  if v_max > 0 then
    perform setval('public.job_number_seq'::regclass, v_max, true);
  else
    perform setval('public.job_number_seq'::regclass, 1, false);
  end if;
end
$$;

-- Backfill is a maintenance operation on a technician-protected field.
-- Disable only the two job ownership/linkage protection triggers inside this
-- migration transaction, then restore them before the migration completes.
alter table public.jobs disable trigger protect_technician_job_fields_trg;
alter table public.jobs disable trigger trg_protect_job_technician_fields;

-- Keep the oldest active occurrence of any duplicated job number and renumber
-- only the later active duplicates.
with ranked as (
  select id,
         row_number() over (
           partition by job_number
           order by created_at nulls last, id
         ) as rn
  from public.jobs
  where deleted_at is null
    and nullif(btrim(job_number),'') is not null
),
to_fix as (
  select id, nextval('public.job_number_seq'::regclass) as n
  from ranked
  where rn > 1
)
update public.jobs j
set job_number = 'JOB' || case when f.n < 10000 then lpad(f.n::text,4,'0') else f.n::text end,
    updated_at = now()
from to_fix f
where j.id = f.id;

-- Backfill active jobs that never received an internal job number.
with to_fix as (
  select id, nextval('public.job_number_seq'::regclass) as n
  from public.jobs
  where deleted_at is null
    and nullif(btrim(job_number),'') is null
  order by created_at nulls last, id
)
update public.jobs j
set job_number = 'JOB' || case when f.n < 10000 then lpad(f.n::text,4,'0') else f.n::text end,
    updated_at = now()
from to_fix f
where j.id = f.id;

alter table public.jobs enable trigger protect_technician_job_fields_trg;
alter table public.jobs enable trigger trg_protect_job_technician_fields;

create unique index if not exists jobs_active_job_number_unique
  on public.jobs(job_number)
  where deleted_at is null and job_number is not null;

create or replace function public.assign_job_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_num bigint;
begin
  if nullif(btrim(new.job_number),'') is null then
    v_num := nextval('public.job_number_seq'::regclass);
    new.job_number := 'JOB' ||
      case when v_num < 10000 then lpad(v_num::text,4,'0') else v_num::text end;
  end if;
  return new;
end;
$function$;

revoke all on function public.assign_job_number() from public, anon, authenticated;
grant execute on function public.assign_job_number() to service_role;

drop trigger if exists jobs_assign_job_number_before_insert on public.jobs;
create trigger jobs_assign_job_number_before_insert
before insert on public.jobs
for each row
execute function public.assign_job_number();
