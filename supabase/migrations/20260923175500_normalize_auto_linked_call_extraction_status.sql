create or replace function public.auto_link_call_by_phone()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n text;
  cid text;
  lid text;
  cc int;
  lc int;
begin
  if new.remote_number is null or btrim(new.remote_number) = '' then
    return new;
  end if;

  n := regexp_replace(new.remote_number, '\D', '', 'g');
  if length(n) = 11 and left(n, 1) = '1' then
    n := right(n, 10);
  end if;
  if length(n) <> 10 then
    return new;
  end if;

  if new.customer_id is null then
    select count(*), min(id)
      into cc, cid
      from public.customers
     where deleted_at is null
       and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = n;
    if cc = 1 then
      new.customer_id := cid;
    end if;
  end if;

  if new.customer_id is null and new.lead_id is null then
    select count(*), min(id)
      into lc, lid
      from public.leads
     where deleted_at is null
       and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = n;
    if lc = 1 then
      new.lead_id := lid;
    end if;
  end if;

  if (new.lead_extraction_status is null or new.lead_extraction_status = 'pending') then
    if new.customer_id is not null then
      new.lead_extraction_status := 'linked_customer';
    elsif new.lead_id is not null then
      new.lead_extraction_status := 'created_or_linked';
    end if;
  end if;

  return new;
end
$function$;

revoke execute on function public.auto_link_call_by_phone() from public, anon, authenticated;
grant execute on function public.auto_link_call_by_phone() to service_role;

update public.calls
   set lead_extraction_status = case
         when customer_id is not null then 'linked_customer'
         when lead_id is not null then 'created_or_linked'
         else lead_extraction_status
       end
 where lead_extraction_status = 'pending'
   and (customer_id is not null or lead_id is not null);
