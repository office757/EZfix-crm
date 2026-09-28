-- Owner policy gates the worker before making any HTTP request. Resolve the
-- existing call-sync credential from Vault at execution time; never embed it.
select cron.schedule('ezfix-ashley-dispatch','* * * * *',$cmd$
 select net.http_post(
  url := 'https://fylbalenuqpovwncwbah.supabase.co/functions/v1/ashley-dispatch',
  headers := jsonb_build_object('Content-Type','application/json','x-ezfix-cron-token',
   (select decrypted_secret from vault.decrypted_secrets where name='ezfix_call_sync_cron_token' limit 1)),
  body := '{"source":"supabase_cron"}'::jsonb,timeout_milliseconds := 55000
 ) from public.dispatch_policy p
 where p.id=true and p.mode='automatic'
 and exists(select 1 from public.ai_manager_settings where id='main' and paused=false);
$cmd$);
