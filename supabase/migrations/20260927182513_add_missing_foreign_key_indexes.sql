-- Applied to production as Supabase migration 20260927182513.
-- Adds covering indexes for foreign keys reported by the Supabase performance advisor.
-- No data, constraints, RLS policies, or application behavior are changed.

create index if not exists marketing_campaigns_created_by_team_id_idx
  on public.marketing_campaigns(created_by_team_id);

create index if not exists marketing_content_approved_by_team_id_idx
  on public.marketing_content(approved_by_team_id);

create index if not exists marketing_content_campaign_id_idx
  on public.marketing_content(campaign_id);

create index if not exists marketing_content_created_by_team_id_idx
  on public.marketing_content(created_by_team_id);

create index if not exists marketing_conversion_events_customer_id_idx
  on public.marketing_conversion_events(customer_id);

create index if not exists marketing_conversion_events_job_id_idx
  on public.marketing_conversion_events(job_id);

create index if not exists marketing_daily_metrics_campaign_id_idx
  on public.marketing_daily_metrics(campaign_id);

create index if not exists public_estimate_signing_tokens_created_by_team_id_idx
  on public.public_estimate_signing_tokens(created_by_team_id);

create index if not exists voice_callback_authorizations_created_by_team_id_idx
  on public.voice_callback_authorizations(created_by_team_id);
