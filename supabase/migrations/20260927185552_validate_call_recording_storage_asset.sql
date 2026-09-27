create or replace function public.set_call_recording_asset(p_call_id text,p_recording_asset jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_role text:=lower(coalesce(public.current_app_role(),'')); v_id text; v_path text; v_size bigint; v_result jsonb;
begin
 if auth.uid() is null or v_role not in ('owner','admin') then raise exception 'Owner/Admin access required' using errcode='42501'; end if;
 if not exists(select 1 from public.calls where id=p_call_id) then raise exception 'Call not found' using errcode='P0002'; end if;
 if p_recording_asset is null or p_recording_asset='null'::jsonb then update public.calls set recording_asset=null where id=p_call_id returning recording_asset into v_result; return v_result; end if;
 if jsonb_typeof(p_recording_asset)<>'object' then raise exception 'Recording asset must be an object'; end if;
 v_id:=nullif(btrim(p_recording_asset->>'id'),''); v_path:=nullif(btrim(p_recording_asset->>'path'),''); v_size:=coalesce(nullif(p_recording_asset->>'size','')::bigint,0);
 if v_id is null or v_id !~ '^crm-assets/call-recordings/[A-Za-z0-9._/-]+$' then raise exception 'Invalid recording asset id'; end if;
 if v_path is null or v_path !~ '^call-recordings/[A-Za-z0-9._/-]+$' then raise exception 'Invalid recording asset path'; end if;
 if v_id<>('crm-assets/'||v_path) then raise exception 'Recording asset id/path mismatch'; end if;
 if v_size<=0 or v_size>104857600 then raise exception 'Recording file must be between 1 byte and 100 MB'; end if;
 if not exists(select 1 from storage.objects where bucket_id='crm-assets' and name=v_path) then raise exception 'Recording file not found in CRM storage'; end if;
 v_result:=jsonb_build_object('id',v_id,'path',v_path,'name',left(coalesce(p_recording_asset->>'name','Call recording'),255),'size',v_size,'contentType',left(coalesce(p_recording_asset->>'contentType','application/octet-stream'),120),'attachedAt',now(),'attachedByTeamId',public.current_team_id());
 update public.calls set recording_asset=v_result where id=p_call_id; return v_result;
end $$;
revoke all on function public.set_call_recording_asset(text,jsonb) from public,anon;
grant execute on function public.set_call_recording_asset(text,jsonb) to authenticated;