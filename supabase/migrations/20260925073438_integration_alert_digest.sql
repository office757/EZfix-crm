-- Production integration alert digest: state, audit log, secure cron token and 15-minute scheduler.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create table if not exists public.integration_alert_config (
  id text primary key check (id = 'main'),
  enabled boolean not null default true,
  started_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  last_sent_at timestamptz null,
  token_hash text not null,
  digest_interval_minutes integer not null default 15 check (digest_interval_minutes between 5 and 1440),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_alert_digests (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  digest_hash text not null unique,
  counts jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed','provider_outcome_unknown','abandoned')),
  attempt_count integer not null default 0,
  provider_message_id text null,
  error_text text null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  updated_at timestamptz not null default now()
);

alter table public.integration_alert_config enable row level security;
alter table public.integration_alert_digests enable row level security;

revoke all on table public.integration_alert_config from public, anon, authenticated;
revoke all on table public.integration_alert_digests from public, anon, authenticated;
grant select, insert, update on table public.integration_alert_config to service_role;
grant select, insert, update on table public.integration_alert_digests to service_role;

create index if not exists integration_alert_digests_created_idx
  on public.integration_alert_digests(created_at desc);

do $$
declare
  v_secret_id uuid;
  v_token text;
begin
  select id, decrypted_secret
    into v_secret_id, v_token
  from vault.decrypted_secrets
  where name = 'ezfix_integration_alert_cron_token'
  limit 1;

  if v_secret_id is null then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      v_token,
      'ezfix_integration_alert_cron_token',
      'Internal token used only by Supabase Cron to invoke the EZfix integration alert digest Edge Function'
    );
  end if;

  insert into public.integration_alert_config(
    id, enabled, started_at, last_checked_at, token_hash, digest_interval_minutes, updated_at
  )
  values(
    'main', true, now(), now(),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    15, now()
  )
  on conflict (id) do update
     set token_hash = excluded.token_hash,
         enabled = true,
         digest_interval_minutes = 15,
         updated_at = now();
end
$$;

select cron.schedule(
  'ezfix-integration-alert-digest',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://fylbalenuqpovwncwbah.supabase.co/functions/v1/integration-alert-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ezfix-cron-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ezfix_integration_alert_cron_token'
        limit 1
      )
    ),
    body := jsonb_build_object('source','supabase_cron','scheduled_at',now()),
    timeout_milliseconds := 15000
  );
  $cron$
);
