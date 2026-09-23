import { createClient } from "npm:@supabase/supabase-js@2";
import {
  assertReadTool,
  normalizeInput,
  permissionActionFor,
  auditInput,
  aggregateCampaignSnapshot,
  aggregateAttribution,
} from './policy.ts';

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase environment is incomplete');
}

async function updateAudit(db, id, patch) {
  try { await db.from('ai_actions').update(patch).eq('id', id); } catch (_) { /* audit must not change read behavior */ }
}

async function getPermission(db, action) {
  const { data, error } = await db
    .from('ai_permissions')
    .select('enabled,level,auto_limit')
    .eq('domain', 'google_ads')
    .eq('action', action)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: HEADERS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ ok: false, error: 'Unauthorized' }, 401);

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: member, error: memberError } = await db
    .from('team')
    .select('id,role,status')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (memberError || !member || member.role !== 'owner' || member.status !== 'active') {
    return json({ ok: false, error: 'Owner access required' }, 403);
  }

  let body;
  try { body = await req.json(); } catch (_) { return json({ ok: false, error: 'Invalid JSON body' }, 400); }

  let tool;
  let input;
  try {
    tool = assertReadTool(body?.tool);
    input = normalizeInput(body?.input);
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Invalid read request', code: error?.code || 'INVALID_REQUEST' }, 400);
  }

  const actionId = crypto.randomUUID();
  const { error: auditInsertError } = await db.from('ai_actions').insert({
    id: actionId,
    created_by_team_id: member.id,
    model_provider: 'system',
    tool: `google_ads_readonly:${tool}`,
    domain: 'google_ads',
    requested_action: auditInput(input),
    approval_status: 'not_required',
  });
  if (auditInsertError) {
    return json({ ok: false, error: 'Could not create read audit record' }, 500);
  }

  const permissionAction = permissionActionFor(tool);
  let permission;
  try {
    permission = await getPermission(db, permissionAction);
  } catch (error) {
    await updateAudit(db, actionId, { success: false, error_message: 'Could not verify Google Ads read permission', api_result: { ok: false } });
    return json({ ok: false, error: 'Could not verify Google Ads read permission', actionId }, 500);
  }
  if (!permission?.enabled) {
    await updateAudit(db, actionId, { success: false, error_message: 'Google Ads read permission disabled', api_result: { ok: false } });
    return json({ ok: false, error: 'Google Ads read permission disabled', actionId }, 403);
  }

  try {
    let result;

    if (tool === 'status') {
      const attributionPermission = await getPermission(db, 'read_crm_attribution');
      const baseReads = [
        db.from('google_ads_connections')
          .select('id,created_at,updated_at,status,google_account_email,selected_customer_id,login_customer_id,token_expires_at,last_error,last_synced_at')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('google_ads_accounts').select('*', { count: 'exact', head: true }),
        db.from('google_ads_campaign_reporting').select('*', { count: 'exact', head: true }),
        db.from('google_ads_daily_metrics').select('*', { count: 'exact', head: true }),
        db.from('google_ads_sync_state').select('resource_type,synced_through,last_run_at,status,last_error').order('last_run_at', { ascending: false }).limit(50),
      ];
      const [connectionRes, accountsRes, campaignsRes, metricsRes, syncRes] = await Promise.all(baseReads);
      for (const r of [connectionRes, accountsRes, campaignsRes, metricsRes, syncRes]) if (r.error) throw r.error;

      let attributionCount = null;
      if (attributionPermission?.enabled) {
        const attributionRes = await db.from('google_ads_crm_attribution_summary').select('*', { count: 'exact', head: true });
        if (attributionRes.error) throw attributionRes.error;
        attributionCount = attributionRes.count || 0;
      }

      result = {
        mode: 'read_only',
        live_changes_enabled: false,
        connection: connectionRes.data || null,
        row_counts: {
          accounts: accountsRes.count || 0,
          campaigns: campaignsRes.count || 0,
          daily_metrics: metricsRes.count || 0,
          attribution: attributionCount,
        },
        attribution_access: !!attributionPermission?.enabled,
        sync_state: syncRes.data || [],
      };
    } else if (tool === 'summary') {
      const attributionPermission = await getPermission(db, 'read_crm_attribution');
      let campaignQuery = db.from('google_ads_campaign_reporting')
        .select('customer_id,campaign_id,status,impressions,clicks,cost_micros,conversions,conversions_value,synced_at')
        .order('synced_at', { ascending: false }).limit(1000);
      if (input.customer_id) campaignQuery = campaignQuery.eq('customer_id', input.customer_id);
      if (input.campaign_id) campaignQuery = campaignQuery.eq('campaign_id', input.campaign_id);

      const [connectionRes, campaignRes, syncRes] = await Promise.all([
        db.from('google_ads_connections')
          .select('id,status,google_account_email,selected_customer_id,login_customer_id,last_error,last_synced_at')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        campaignQuery,
        db.from('google_ads_sync_state').select('resource_type,synced_through,last_run_at,status,last_error').order('last_run_at', { ascending: false }).limit(50),
      ]);
      for (const r of [connectionRes, campaignRes, syncRes]) if (r.error) throw r.error;

      let attribution = { available: false, reason: 'permission_disabled', totals: null };
      if (attributionPermission?.enabled) {
        let attributionQuery = db.from('google_ads_crm_attribution_summary')
          .select('google_ads_customer_id,campaign_id,attributed_leads,gclid_leads,privacy_click_id_leads')
          .limit(1000);
        if (input.customer_id) attributionQuery = attributionQuery.eq('google_ads_customer_id', input.customer_id);
        if (input.campaign_id) attributionQuery = attributionQuery.eq('campaign_id', input.campaign_id);
        const attributionRes = await attributionQuery;
        if (attributionRes.error) throw attributionRes.error;
        attribution = {
          available: true,
          reason: null,
          totals: aggregateAttribution(attributionRes.data || []),
        };
      }

      result = {
        mode: 'read_only',
        live_changes_enabled: false,
        connection: connectionRes.data || null,
        campaign_snapshot: {
          ...aggregateCampaignSnapshot(campaignRes.data || []),
          source_rows: (campaignRes.data || []).length,
          complete: (campaignRes.data || []).length < 1000,
        },
        attribution,
        sync_state: syncRes.data || [],
      };
    } else if (tool === 'accounts') {
      let q = db.from('google_ads_accounts')
        .select('id,connection_id,customer_id,descriptive_name,currency_code,time_zone,is_manager,selected,updated_at')
        .order('selected', { ascending: false }).order('descriptive_name', { ascending: true }).limit(input.limit);
      if (input.customer_id) q = q.eq('customer_id', input.customer_id);
      const { data, error } = await q; if (error) throw error;
      result = { accounts: data || [] };
    } else if (tool === 'campaigns') {
      let q = db.from('google_ads_campaign_reporting')
        .select('connection_id,customer_id,campaign_id,name,status,advertising_channel_type,bidding_strategy_type,budget_micros,serving_status,synced_at,impressions,clicks,cost_micros,conversions,conversions_value,ctr_percent,avg_cpc')
        .order('synced_at', { ascending: false }).limit(input.limit);
      if (input.customer_id) q = q.eq('customer_id', input.customer_id);
      if (input.campaign_id) q = q.eq('campaign_id', input.campaign_id);
      const { data, error } = await q; if (error) throw error;
      result = { campaigns: data || [] };
    } else if (tool === 'metrics') {
      let q = db.from('google_ads_daily_metrics')
        .select('id,connection_id,customer_id,campaign_id,metric_date,impressions,clicks,cost_micros,conversions,conversions_value,interactions,synced_at')
        .order('metric_date', { ascending: false }).limit(input.limit);
      if (input.customer_id) q = q.eq('customer_id', input.customer_id);
      if (input.campaign_id) q = q.eq('campaign_id', input.campaign_id);
      if (input.date_from) q = q.gte('metric_date', input.date_from);
      if (input.date_to) q = q.lte('metric_date', input.date_to);
      const { data, error } = await q; if (error) throw error;
      result = { metrics: data || [] };
    } else if (tool === 'attribution') {
      let q = db.from('google_ads_crm_attribution_summary')
        .select('google_ads_customer_id,campaign_id,attributed_leads,gclid_leads,privacy_click_id_leads,first_captured_at,last_captured_at')
        .order('last_captured_at', { ascending: false }).limit(input.limit);
      if (input.customer_id) q = q.eq('google_ads_customer_id', input.customer_id);
      if (input.campaign_id) q = q.eq('campaign_id', input.campaign_id);
      const { data, error } = await q; if (error) throw error;
      result = { attribution: data || [] };
    } else if (tool === 'permissions') {
      const { data, error } = await db.from('ai_permissions')
        .select('id,domain,action,level,enabled,auto_limit,updated_at')
        .eq('domain', 'google_ads').order('action', { ascending: true });
      if (error) throw error;
      result = { permissions: data || [] };
    } else if (tool === 'approval_queue') {
      const { data, error } = await db.from('ai_approvals')
        .select('id,created_at,proposed_by_action_id,domain,action,reason,current_value,proposed_value,evidence,risk_level,status,decided_at,decided_by_team_id')
        .eq('domain', 'google_ads').eq('status', input.approval_status)
        .order('created_at', { ascending: false }).limit(input.limit);
      if (error) throw error;
      result = { approvals: data || [] };
    } else if (tool === 'audit_log') {
      const { data, error } = await db.from('ai_actions')
        .select('id,created_at,created_by_team_id,model_provider,model,tool,domain,requested_action,entity_type,entity_id,approval_status,success,error_message')
        .eq('domain', 'google_ads').order('created_at', { ascending: false }).limit(input.limit);
      if (error) throw error;
      result = { actions: data || [] };
    }

    await updateAudit(db, actionId, { success: true, api_result: { ok: true, read_only: true } });
    return json({ ok: true, read_only: true, tool, result, actionId });
  } catch (error) {
    const message = error?.message || 'Read failed';
    await updateAudit(db, actionId, { success: false, error_message: message, api_result: { ok: false, read_only: true } });
    return json({ ok: false, read_only: true, error: message, actionId }, 500);
  }
});
