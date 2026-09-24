-- Harden Google Ads and marketing warehouse surfaces.
revoke all on table public.google_ads_accounts from anon;
revoke all on table public.google_ads_connections from anon;
revoke all on table public.google_ads_sync_state from anon;
revoke all on table public.google_ads_campaign_snapshots from anon;
revoke all on table public.google_ads_daily_metrics from anon;

revoke all on table public.marketing_campaigns from anon;
revoke all on table public.marketing_channels from anon;
revoke all on table public.marketing_content from anon;
revoke all on table public.marketing_conversion_events from anon;
revoke all on table public.marketing_daily_metrics from anon;
revoke all on table public.marketing_sync_runs from anon;

alter policy marketing_conversion_events_owner_all on public.marketing_conversion_events to authenticated;
alter policy marketing_daily_metrics_owner_all on public.marketing_daily_metrics to authenticated;
alter policy marketing_sync_runs_owner_all on public.marketing_sync_runs to authenticated;
