-- Durable business changes, written in the same transaction as the record.
-- Existing workflow/provider events remain intact. Historical details are not fabricated.
alter table public.audit_log add column details jsonb not null default '{}'::jsonb;

create role crm_audit_writer nologin noinherit;
grant crm_audit_writer to postgres;
grant usage on schema public,private,auth to crm_audit_writer;
grant create on schema private to crm_audit_writer;
grant insert on public.audit_log to crm_audit_writer;
grant select(id,name,auth_user_id) on public.team to crm_audit_writer;
grant execute on function public.current_team_id(),auth.uid() to crm_audit_writer;
create policy audit_writer_insert on public.audit_log for insert to crm_audit_writer with check(source='database');
create policy audit_writer_actor on public.team for select to crm_audit_writer using(auth_user_id=(select auth.uid()));

-- Explicit allowlist: never copy secrets, auth bindings, payment links, provider
-- payloads, document tokens, signatures, photo URLs, or arbitrary app_data.
create function private.business_audit_snapshot(p_table text,p_row jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb; allowed text[]; list jsonb;
begin
 if p_row is null then return null;end if;
 allowed:=case when p_table='settings' then array['cc_surcharge_percent'] else array[
  'name','title','number','job_number','customer_id','technician_id','technician','assigned_technician_id',
  'assignment_status','assigned_to_id','status','role','commission_percent','scheduled_date','appointment_window',
  'date','due_date','next_follow_up','due_term','material_cost','tax_rate','discount','deposit_required',
  'amount','category','description','service_requested','cancel_reason','decline_reason','reason',
  'supplier_id','product_id','product_name','qty_before','qty_after','delta','type','rate','cost','qty','unit',
  'taxable','active','track_stock','deleted_at','converted_job_id','converted_invoice_id',
  'preferred_payment_method','payment_provider','lead_id','job_id','zip','expires_at','responded_at','kind'
 ] end;
 select coalesce(jsonb_object_agg(k,p_row->k),'{}'::jsonb) into result from unnest(allowed) as k where p_row?k;
 foreach list in array array[p_row->'items',p_row->'line_items'] loop
  if jsonb_typeof(list)='array' then
   result:=result||jsonb_build_object('items',(select coalesce(jsonb_agg(jsonb_build_object(
    'description',coalesce(item->'description',item->'name'),'qty',item->'qty','rate',item->'rate','taxable',item->'taxable','product_id',coalesce(item->'productId',item->'product_id'))),'[]') from jsonb_array_elements(list) as item));
  end if;
 end loop;
 if jsonb_typeof(p_row->'payments')='array' then
  result:=result||jsonb_build_object('payments',(select coalesce(jsonb_agg(jsonb_build_object(
   'date',p->'date','method',p->'method','amount',p->'amount','applied_amount',coalesce(p->'appliedAmount',p->'applied_amount',p->'amount'),'card_fee',coalesce(p->'cardFee',p->'card_fee'))),'[]') from jsonb_array_elements(p_row->'payments') as p));
 end if;
 if jsonb_typeof(p_row->'photos')='array' then result:=result||jsonb_build_object('photo_count',jsonb_array_length(p_row->'photos'));end if;
 if p_row?'signature' then result:=result||jsonb_build_object('signature_present',p_row->'signature' is not null and p_row->'signature'<>'null'::jsonb and p_row->'signature'<>'{}'::jsonb and p_row->'signature'<>to_jsonb(''::text));end if;
 if p_table='jobs' then result:=result||jsonb_build_object('parts_paid_by',coalesce(p_row#>'{app_data,parts_paid_by}',p_row#>'{app_data,partsPaidBy}',to_jsonb('company'::text)));end if;
 if p_table='team' then result:=result||jsonb_build_object('archived_at',p_row#>'{app_data,archivedAt}');end if;
 return result;
end;$$;
alter function private.business_audit_snapshot(text,jsonb) owner to crm_audit_writer;
revoke all on function private.business_audit_snapshot(text,jsonb) from public,anon,authenticated;

-- This private trigger function is the only elevated entry point. Its owner can
-- insert audit rows and read only the caller's actor label; it cannot change business rows.
create function private.capture_business_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_row jsonb;after_row jsonb;fields text[];actor_id text;actor_name text;why text;record_id text;event_action text;
begin
 if TG_OP<>'INSERT' then before_row:=to_jsonb(old);end if;
 if TG_OP<>'DELETE' then after_row:=to_jsonb(new);end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(coalesce(before_row,'{}')||coalesce(after_row,'{}')) as k
 where k not in ('id','created_at','updated_at','row_version') and before_row->k is distinct from after_row->k;
 if TG_OP='UPDATE' and coalesce(array_length(fields,1),0)=0 then return new;end if;
 actor_id:=public.current_team_id();
 if actor_id is not null then select name into actor_name from public.team where id=actor_id;end if;
 record_id:=coalesce(after_row->>'id',before_row->>'id');
 if after_row->>'cancel_reason' is distinct from before_row->>'cancel_reason' then why:=nullif(after_row->>'cancel_reason','');end if;
 if why is null and after_row->>'decline_reason' is distinct from before_row->>'decline_reason' then why:=nullif(after_row->>'decline_reason','');end if;
 if why is null and after_row->>'reason' is distinct from before_row->>'reason' then why:=nullif(after_row->>'reason','');end if;
 if why is null and after_row->'status_history' is distinct from before_row->'status_history' and jsonb_typeof(after_row->'status_history')='array' then why:=nullif(after_row#>>'{status_history,-1,reason}','');end if;
 event_action:=case TG_OP when 'INSERT' then 'record_created' when 'DELETE' then 'record_deleted' else 'record_updated' end;
 insert into public.audit_log(id,action,summary,entity_type,entity_id,source,created_by_team_id,details)
 values(gen_random_uuid()::text,event_action,
  initcap(replace(TG_TABLE_NAME,'_',' '))||' record '||lower(TG_OP)||case when TG_OP='UPDATE' then ': '||array_to_string(fields,', ') else '' end,
  TG_TABLE_NAME,record_id,'database',actor_id,jsonb_build_object(
   'operation',TG_OP,'actor_name',actor_name,'changed_fields',to_jsonb(coalesce(fields,array[]::text[])),
   'before',private.business_audit_snapshot(TG_TABLE_NAME,before_row),'after',private.business_audit_snapshot(TG_TABLE_NAME,after_row),'reason',why));
 if TG_OP='DELETE' then return old;else return new;end if;
end;$$;
alter function private.capture_business_change() owner to crm_audit_writer;
revoke all on function private.capture_business_change() from public,anon,authenticated;
revoke create on schema private from crm_audit_writer;

do $$declare tbl text;begin
 foreach tbl in array array['customers','leads','jobs','estimates','invoices','team','products','inventory_adjustments','suppliers','purchase_orders','expenses','tasks','settings','lead_offers','job_evidence','lead_partners','social_posts'] loop
  execute format('create trigger capture_business_change after insert or update or delete on public.%I for each row execute function private.capture_business_change()',tbl);
 end loop;
end;$$;

-- SELECT inherits the existing Owner/Office/recipient RLS. No client can write
-- details or rewrite the action/actor; authenticated UPDATE remains read-only acknowledgement.
revoke insert,delete,update on public.audit_log from authenticated,anon;
grant update(read) on public.audit_log to authenticated;
