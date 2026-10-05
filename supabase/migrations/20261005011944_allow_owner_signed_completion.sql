-- Preserve the staff executor and add an invoker-only owner path for real signatures.
create or replace function public.complete_dispatch_job(p_job_id text,p_signature jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.jobs%rowtype;
begin
 if auth.uid() is null or not public.is_owner() then
  perform private.complete_dispatch_job(p_job_id,p_signature);return;
 end if;
 select * into j from public.jobs where id=p_job_id and deleted_at is null for update;
 if not found or j.workflow_version<>1 then raise exception 'Job unavailable';end if;
 if j.status='completed' then return;end if;
 if p_signature is null or length(coalesce(p_signature->>'name',''))<1
  or length(coalesce(p_signature->>'dataUrl','')) not between 100 and 1000000
  or coalesce(p_signature->>'dataUrl','') not like 'data:image/%' then raise exception 'Customer signature required';end if;
 update public.jobs set status='completed',
  status_history=coalesce(status_history,'[]')||jsonb_build_array(jsonb_build_object('status','completed','at',floor(extract(epoch from now())*1000))),
  app_data=coalesce(app_data,'{}')||jsonb_build_object('completion_signature',p_signature||jsonb_build_object('at',floor(extract(epoch from now())*1000)))
 where id=j.id;
end;$$;
revoke all on function public.complete_dispatch_job(text,jsonb) from public,anon;
grant execute on function public.complete_dispatch_job(text,jsonb) to authenticated;
