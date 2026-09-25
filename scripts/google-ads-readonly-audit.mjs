import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const indexPath = path.join(root, 'supabase/functions/google-ads-readonly/index.ts');
const policyPath = path.join(root, 'supabase/functions/google-ads-readonly/policy.ts');

const index = fs.readFileSync(indexPath, 'utf8');
const policy = fs.readFileSync(policyPath, 'utf8');
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

for (const tool of ['status','summary','accounts','campaigns','metrics','attribution','permissions','approval_queue','audit_log']) {
  check(policy.includes(`'${tool}'`), `missing read tool ${tool}`);
}
for (const forbidden of ['pause_campaign','launch_campaign','optimize_campaign','change_campaign_budget','change_bidding_strategy','add_keyword','add_negative_keyword','delete_campaign','create_campaign']) {
  check(!policy.includes(`'${forbidden}'`), `forbidden live-change tool exposed: ${forbidden}`);
}

check(index.includes("member.role !== 'owner'"), 'owner-only guard missing');
check(index.includes("member.status !== 'active'"), 'active-team guard missing');
check(index.includes(".eq('domain', 'google_ads')"), 'Google Ads permission domain guard missing');
check(index.includes("permissionActionFor(tool)"), 'per-tool permission mapping missing');
check(index.includes("'read_crm_attribution'"), 'separate CRM attribution permission missing');
check(index.includes("mode: 'read_only'"), 'read-only mode marker missing');
check(index.includes('live_changes_enabled: false'), 'live-change false marker missing');
check(index.includes("tool: `google_ads_readonly:${tool}`"), 'read audit tool marker missing');
check(index.includes("approval_status: 'not_required'"), 'read audit approval classification missing');
check(index.includes("if (auditInsertError)"), 'audit creation fail-closed guard missing');
check(index.includes("Could not create read audit record"), 'audit creation failure message missing');
check(index.includes("google_ads_campaign_reporting"), 'campaign read model missing');
check(index.includes("google_ads_daily_metrics"), 'daily metrics read model missing');
check(index.includes("google_ads_crm_attribution_summary"), 'CRM attribution read model missing');
check(index.includes("google_ads_sync_state"), 'sync-state read model missing');
check(index.includes("aggregateCampaignSnapshot"), 'campaign aggregation missing');
check(index.includes("aggregateAttribution"), 'attribution aggregation missing');
check(policy.includes("date_from must be on or before date_to"), 'date range validation missing');
check(policy.includes("Invalid identifier filter"), 'identifier validation missing');
check(policy.includes("Math.min(250"), 'read limit cap missing');

const googleAdsWritePattern = /from\(['\"]google_ads_[^'\"]+['\"]\)[\s\S]{0,180}\.(insert|update|upsert|delete)\s*\(/g;
check(!googleAdsWritePattern.test(index), 'Google Ads table write detected');

for (const forbiddenApiTerm of ['googleAds:mutate','campaigns:mutate','campaignBudgets:mutate','adGroupCriteria:mutate','adGroups:mutate','ads:mutate']) {
  check(!index.includes(forbiddenApiTerm), `Google Ads mutate API term detected: ${forbiddenApiTerm}`);
}

check(!/refresh_token|access_token|client_secret/i.test(index), 'OAuth secret/token fields should not be exposed by read endpoint');
check(!/refresh_token|access_token|client_secret/i.test(policy), 'OAuth secret/token fields should not be present in policy module');

console.log(`google-ads-readonly audit passed: ${checks} assertions`);
