alter table public.team drop constraint team_role_check;
alter table public.team add constraint team_role_check check(role in ('owner','admin','dispatcher','office','technician','marketing_manager'));

create function public.is_office_secretary() returns boolean language sql stable security invoker set search_path='' as $$select coalesce(public.current_app_role()='office',false)$$;
revoke all on function public.is_office_secretary() from public,anon;
grant execute on function public.is_office_secretary() to authenticated;

-- Give Office operational writes without granting account administration or secrets.
do $$declare t text;begin
 foreach t in array array['products','suppliers','purchase_orders','expenses','gallery_projects','saved_designs','properties','warranties','inspections'] loop
  execute format('create policy %I on public.%I for select to authenticated using ((select public.is_office_secretary()))',t||'_secretary_read',t);
  execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_office_secretary()))',t||'_secretary_insert',t);
  execute format('create policy %I on public.%I for update to authenticated using ((select public.is_office_secretary())) with check ((select public.is_office_secretary()))',t||'_secretary_update',t);
 end loop;
end$$;
create policy team_secretary_technician_update on public.team for update to authenticated
using ((select public.is_office_secretary()) and role='technician' and app_data->>'archivedAt' is null)
with check ((select public.is_office_secretary()) and role='technician' and app_data->>'archivedAt' is null);

create or replace function public.guard_team_privilege_changes() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor_role text:=public.current_app_role();begin
 if actor_role='owner' or (actor_role is null and auth.role()='service_role') then return coalesce(new,old);end if;
 if actor_role='office' and tg_op='UPDATE' then
  if old.role<>'technician' or new.role is distinct from old.role or new.auth_user_id is distinct from old.auth_user_id or new.id is distinct from old.id or new.app_data is distinct from old.app_data then raise exception 'Office can edit technician contact details, availability and commission only';end if;
  return new;
 end if;
 if actor_role <> 'admin' then raise exception 'Only Owner or Admin may manage team accounts';end if;
 if tg_op='INSERT' then
  if new.role in ('owner','admin') then raise exception 'Only Owner may create Owner or Admin accounts';end if;return new;
 elsif tg_op='UPDATE' then
  if old.role in ('owner','admin') or new.role in ('owner','admin') then raise exception 'Only Owner may modify Owner or Admin accounts';end if;return new;
 else
  if old.role in ('owner','admin') then raise exception 'Only Owner may delete Owner or Admin accounts';end if;return old;
 end if;
end;$$;

create or replace function public.protect_app_data_from_non_owner() returns trigger
language plpgsql security invoker set search_path='' as $$begin
 if current_user in ('crm_workflow_executor','service_role') or public.is_owner() then return new;end if;
 if public.current_app_role()='office' and tg_table_name=any(array['customers','leads','jobs','estimates','invoices','products','expenses','properties','tasks','warranties','suppliers','purchase_orders','inspections','gallery_projects','saved_designs']) then return new;end if;
 if new.app_data is distinct from old.app_data then raise exception 'app_data is owner-managed';end if;
 return new;
end;$$;

create function private.office_settings() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or public.is_office() is not true then raise exception 'Office access required';end if;
 return (select jsonb_build_object('stripe_link',stripe_link,'google_review_link',google_review_link,'email_logo_url',email_logo_url,'cc_surcharge_percent',cc_surcharge_percent,'templates',templates,'inkbox_phone',jsonb_build_object('number',inkbox_phone->>'number','identity',inkbox_phone->>'identity','phoneStatus',inkbox_phone->>'phoneStatus','smsStatus',inkbox_phone->>'smsStatus')) from public.settings where id='main');
end;$$;
create function public.get_office_settings() returns jsonb language sql security invoker set search_path='' as $$select private.office_settings()$$;
revoke all on function private.office_settings(),public.get_office_settings() from public,anon;
grant execute on function private.office_settings(),public.get_office_settings() to authenticated;

-- Read original audio and transcript replays; provider assets remain server managed.
create policy crm_assets_secretary_audio_read on storage.objects for select to authenticated
using(bucket_id='crm-assets' and (select public.is_office_secretary()) and (name like 'call-recordings/%' or name like 'transcript-replays/%'));

create function private.office_link_sms_lead(p_sms_id text,p_lead_id text) returns text language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or public.is_office() is not true then raise exception 'Office access required';end if;
 if not exists(select 1 from public.sms_messages s join public.leads l on l.id=p_lead_id and l.deleted_at is null where s.id=p_sms_id and right(regexp_replace(s.remote_phone_number,'[^0-9]','','g'),10)=right(regexp_replace(l.phone,'[^0-9]','','g'),10)) then raise exception 'Lead phone must match this SMS conversation';end if;
 update public.sms_messages set lead_id=p_lead_id where id=p_sms_id and lead_id is null and customer_id is null;
 return p_sms_id;
end;$$;
create function public.office_link_sms_lead(p_sms_id text,p_lead_id text) returns text language sql security invoker set search_path='' as $$select private.office_link_sms_lead(p_sms_id,p_lead_id)$$;
revoke all on function private.office_link_sms_lead(text,text),public.office_link_sms_lead(text,text) from public,anon;
grant execute on function private.office_link_sms_lead(text,text),public.office_link_sms_lead(text,text) to authenticated;

create table public.social_posts(
 id text primary key,title text not null,caption text not null default '',
 platforms text[] not null default '{}',photos jsonb not null default '[]',
 status text not null default 'draft' check(status in ('draft','ready','posted_manual')),
 scheduled_for timestamptz,published_url text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 row_version bigint not null default 1,
 check(platforms <@ array['instagram','facebook','google_business']::text[]),
 check(jsonb_typeof(photos)='array'),
 check(status<>'posted_manual' or (published_url is not null and published_url ~ '^https://'))
);
alter table public.social_posts enable row level security;
grant select,insert,update on public.social_posts to authenticated;
grant all on public.social_posts to service_role;
create policy social_posts_office_read on public.social_posts for select to authenticated using((select public.is_owner()) or (select public.is_office_secretary()));
create policy social_posts_office_insert on public.social_posts for insert to authenticated with check((select public.is_owner()) or (select public.is_office_secretary()));
create policy social_posts_office_update on public.social_posts for update to authenticated using((select public.is_owner()) or (select public.is_office_secretary())) with check((select public.is_owner()) or (select public.is_office_secretary()));
create trigger trg_row_metadata before insert or update on public.social_posts for each row execute function public.maintain_row_metadata('has_updated_at','has_row_version');
alter publication supabase_realtime add table public.social_posts;
