-- Applied to production as Supabase migration 20260927183646.
-- Removes plaintext Inkbox cron tokens from pg_cron command text and resolves
-- the token at execution time from Supabase Vault instead.
-- Schedules, endpoints, request bodies and Edge Function behavior are unchanged.

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='ezfix-inkbox-call-reconciliation' limit 1),
  command := $cmd$
 select net.http_post(
   url := 'https://fylbalenuqpovwncwbah.supabase.co/functions/v1/sync-inkbox-calls',
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'x-ezfix-cron-token',(
       select decrypted_secret
       from vault.decrypted_secrets
       where name='ezfix_call_sync_cron_token'
       limit 1
     )
   ),
   body := jsonb_build_object('source','supabase_cron','scheduled_at',now()),
   timeout_milliseconds := 15000
 );
$cmd$
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='ezfix-inkbox-call-lead-processing' limit 1),
  command := $cmd$
 select net.http_post(
   url := 'https://fylbalenuqpovwncwbah.supabase.co/functions/v1/process-inkbox-call-leads',
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'x-ezfix-cron-token',(
       select decrypted_secret
       from vault.decrypted_secrets
       where name='ezfix_call_sync_cron_token'
       limit 1
     )
   ),
   body := jsonb_build_object('source','supabase_cron','scheduled_at',now()),
   timeout_milliseconds := 15000
 );
$cmd$
);