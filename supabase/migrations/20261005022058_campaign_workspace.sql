create table public.content_campaigns (
 id uuid primary key, name text not null check(length(name) between 1 and 120),
 brief text not null check(length(brief) between 1 and 1500),
 platform text not null check(platform in ('instagram','facebook','google_business')),
 status text not null default 'active' check(status in ('active','archived')),
 created_by text not null references public.team(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index content_campaigns_creator on public.content_campaigns(created_by);
create table public.content_campaign_posts (
 id uuid primary key,campaign_id uuid not null references public.content_campaigns(id),
 slot integer not null check(slot between 1 and 1000),title text not null check(length(title) between 1 and 200),
 caption text not null check(length(caption) between 1 and 5000),photos jsonb not null default '[]' check(jsonb_typeof(photos)='array'),
 scheduled_for timestamptz,status text not null default 'draft' check(status in ('draft','approved','posted_manual')),
 revision integer not null default 1,approved_by text references public.team(id),approved_at timestamptz,published_url text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(campaign_id,slot),
 check(status<>'posted_manual' or published_url is not null and published_url ~ '^https://[^[:space:]]+$'),
 check(status='draft' or (approved_by is not null and approved_at is not null))
);
create index content_campaign_posts_approval on public.content_campaign_posts(approved_by);
create index content_campaign_posts_due on public.content_campaign_posts(scheduled_for) where status='approved';
alter table public.content_campaigns enable row level security;
alter table public.content_campaign_posts enable row level security;
revoke all on public.content_campaigns,public.content_campaign_posts from anon,authenticated;
grant select on public.content_campaigns,public.content_campaign_posts to authenticated;
grant all on public.content_campaigns,public.content_campaign_posts to service_role;
create policy campaign_read on public.content_campaigns for select to authenticated using ((select public.is_office()) or ((select public.is_marketing_manager()) and created_by=(select public.current_team_id())));
create policy campaign_post_read on public.content_campaign_posts for select to authenticated using (exists(select 1 from public.content_campaigns c where c.id=campaign_id));
create function private.save_content_campaign(p_id uuid,p_name text,p_brief text,p_platform text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor text; existing public.content_campaigns; result public.content_campaigns;
begin
 actor:=public.current_team_id();
 if actor is null or not (public.is_office() or public.is_marketing_manager()) then raise exception 'Campaign access required';end if;
 select * into existing from public.content_campaigns where id=p_id for update;
 if found and not (public.is_office() or existing.created_by=actor) then raise exception 'Campaign access denied';end if;
 insert into public.content_campaigns(id,name,brief,platform,created_by) values(p_id,trim(p_name),trim(p_brief),p_platform,actor)
 on conflict(id) do update set name=excluded.name,brief=excluded.brief,updated_at=now() returning * into result;
 -- Platform remains fixed for an existing campaign; changing it requires a new campaign.
 return to_jsonb(result);
end $$;
create function private.save_content_campaign_post(p_id uuid,p_campaign uuid,p_slot integer,p_title text,p_caption text,p_photos jsonb,p_scheduled timestamptz,p_expected integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare campaign public.content_campaigns; existing public.content_campaign_posts; result public.content_campaign_posts; actor text;
begin
 actor:=public.current_team_id();if actor is null or not (public.is_office() or public.is_marketing_manager()) then raise exception 'Campaign access required';end if;
 select * into campaign from public.content_campaigns where id=p_campaign for update;
 if not found or campaign.status<>'active' or not (public.is_office() or campaign.created_by=actor) then raise exception 'Campaign access denied';end if;
 if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos)>4 then raise exception 'Invalid photos';end if;
 select * into existing from public.content_campaign_posts where id=p_id for update;
 if found then
  if existing.campaign_id<>p_campaign or existing.slot<>p_slot then raise exception 'Post identity mismatch';end if;
  if existing.status='posted_manual' then raise exception 'Published content remains in history; create a new post';end if;
  if p_expected=0 and existing.title=trim(p_title) and existing.caption=trim(p_caption) and existing.photos=p_photos and existing.scheduled_for is not distinct from p_scheduled then return to_jsonb(existing);end if;
  if existing.revision<>p_expected then raise exception 'Post changed. Reload before saving.';end if;
 end if;
 insert into public.content_campaign_posts(id,campaign_id,slot,title,caption,photos,scheduled_for)
 values(p_id,p_campaign,p_slot,trim(p_title),trim(p_caption),p_photos,p_scheduled)
 on conflict(id) do update set title=excluded.title,caption=excluded.caption,photos=excluded.photos,scheduled_for=excluded.scheduled_for,status='draft',approved_by=null,approved_at=null,published_url=null,revision=content_campaign_posts.revision+1,updated_at=now() returning * into result;
 return to_jsonb(result);
end $$;
create function private.review_content_campaign_post(p_id uuid,p_action text,p_revision integer,p_url text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare post public.content_campaign_posts; campaign public.content_campaigns; actor text; result public.content_campaign_posts;
begin
 actor:=public.current_team_id();if actor is null or not (public.is_office() or public.is_marketing_manager()) then raise exception 'Campaign access required';end if;
 select * into post from public.content_campaign_posts where id=p_id for update;if not found then raise exception 'Post not found';end if;
 select * into campaign from public.content_campaigns where id=post.campaign_id;
 if not (public.is_office() or campaign.created_by=actor) or campaign.status<>'active' then raise exception 'Campaign access denied';end if;
 if post.revision<>p_revision then raise exception 'Post changed. Reload before reviewing.';end if;
 if p_action='approve' then
  if not public.is_office() or post.status<>'draft' then raise exception 'Office approval required for a draft';end if;
  update public.content_campaign_posts set status='approved',approved_by=actor,approved_at=now(),updated_at=now() where id=p_id returning * into result;
 elsif p_action='posted_manual' then
  if post.status<>'approved' or p_url is null or p_url!~'^https://[^[:space:]]+$' then raise exception 'Approved post and published HTTPS link required';end if;
  update public.content_campaign_posts set status='posted_manual',published_url=p_url,updated_at=now() where id=p_id returning * into result;
 else raise exception 'Invalid review action';end if;
 insert into public.audit_log(id,action,summary,entity_type,entity_id,source,created_by_team_id,details)
 values(gen_random_uuid()::text,'campaign_'||p_action,case when p_action='approve' then 'Campaign post approved' else 'Campaign post published manually' end,'socialposts',post.campaign_id::text,'app_client',actor,jsonb_build_object('campaign_id',post.campaign_id,'post_id',post.id,'revision',post.revision));
 return to_jsonb(result);
end $$;
create function public.save_content_campaign(p_id uuid,p_name text,p_brief text,p_platform text) returns jsonb language sql security invoker set search_path='' as $$select private.save_content_campaign(p_id,p_name,p_brief,p_platform);$$;
create function public.save_content_campaign_post(p_id uuid,p_campaign uuid,p_slot integer,p_title text,p_caption text,p_photos jsonb,p_scheduled timestamptz,p_expected integer) returns jsonb language sql security invoker set search_path='' as $$select private.save_content_campaign_post(p_id,p_campaign,p_slot,p_title,p_caption,p_photos,p_scheduled,p_expected);$$;
create function public.review_content_campaign_post(p_id uuid,p_action text,p_revision integer,p_url text default null) returns jsonb language sql security invoker set search_path='' as $$select private.review_content_campaign_post(p_id,p_action,p_revision,p_url);$$;
revoke all on function private.save_content_campaign(uuid,text,text,text),private.save_content_campaign_post(uuid,uuid,integer,text,text,jsonb,timestamptz,integer),private.review_content_campaign_post(uuid,text,integer,text),public.save_content_campaign(uuid,text,text,text),public.save_content_campaign_post(uuid,uuid,integer,text,text,jsonb,timestamptz,integer),public.review_content_campaign_post(uuid,text,integer,text) from public,anon;
grant execute on function private.save_content_campaign(uuid,text,text,text),private.save_content_campaign_post(uuid,uuid,integer,text,text,jsonb,timestamptz,integer),private.review_content_campaign_post(uuid,text,integer,text),public.save_content_campaign(uuid,text,text,text),public.save_content_campaign_post(uuid,uuid,integer,text,text,jsonb,timestamptz,integer),public.review_content_campaign_post(uuid,text,integer,text) to authenticated;
grant usage on schema private to authenticated;
-- Marketing accounts can renew only the generated images attached to their own visible campaigns.
create policy campaign_generated_media_read on storage.objects for select to authenticated using (
 bucket_id='crm-assets' and name like 'social/generated/%' and (select public.is_marketing_manager()) and
 exists(select 1 from public.content_campaign_posts p cross join lateral jsonb_array_elements(p.photos) ph where ph->>'path'=storage.objects.name)
);
create table private.campaign_due_runs(post_id uuid not null references public.content_campaign_posts(id),revision integer not null,created_at timestamptz not null default now(),primary key(post_id,revision));
alter table private.campaign_due_runs enable row level security;
revoke all on private.campaign_due_runs from public,anon,authenticated;
create function private.queue_campaign_post_reviews() returns integer language plpgsql security definer set search_path='' as $$
declare post record; inserted integer; total integer:=0;
begin
 for post in select p.id,p.revision,p.campaign_id,p.title,p.scheduled_for,c.name from public.content_campaign_posts p join public.content_campaigns c on c.id=p.campaign_id where p.status='approved' and p.scheduled_for<=now() and c.status='active' loop
  insert into private.campaign_due_runs(post_id,revision) values(post.id,post.revision) on conflict do nothing;get diagnostics inserted=row_count;
  if inserted>0 then insert into public.audit_log(id,action,summary,entity_type,entity_id,source,priority,read,details)
   values(gen_random_uuid()::text,'campaign_post_due',post.name||': approved post ready for publishing — '||post.title,'socialposts',post.campaign_id::text,'system','high',false,jsonb_build_object('campaign_id',post.campaign_id,'post_id',post.id,'scheduled_for',post.scheduled_for));total:=total+1;end if;
 end loop;return total;
end $$;
revoke all on function private.queue_campaign_post_reviews() from public,anon,authenticated;
select cron.schedule('ezfix-campaign-post-review','*/15 * * * *','select private.queue_campaign_post_reviews();');
