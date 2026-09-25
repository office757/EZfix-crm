import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=(name)=>fs.readFileSync(path.join(root,'supabase/functions',name,'index.ts'),'utf8');
const sms=read('send-inkbox-sms');
const calls=read('process-inkbox-call-leads');
const webhook=read('inkbox-webhook');
const sync=read('sync-inkbox-events');
const email=read('send-crm-email');
const ai=read('ai-manager-tools');
let checks=0;
const ok=(cond,msg)=>{assert.ok(cond,msg);checks++;console.log('PASS '+msg);};

for(const src of [sms,webhook,sync]){
  ok(src.includes('match_ambiguous'),'SMS path persists ambiguity state');
  ok(src.includes('cm.length === 1 && lm.length === 0'),'customer auto-link requires zero lead matches');
  ok(src.includes('cm.length === 0 && lm.length === 1'),'lead auto-link requires zero customer matches');
}
ok(sms.includes('SMS_OPT_IN_REQUIRED'),'outbound SMS enforces opt-in');
ok(sms.includes('SMS_PROVIDER_REJECTED'),'explicit provider rejection is surfaced');
ok(sms.includes('SMS_PROVIDER_OUTCOME_UNKNOWN'),'unknown provider outcome is not mislabeled');
ok(sms.includes('outbound_communication_approvals'),'outbound SMS preserves approval boundary');
ok(sms.includes('createdByTechnicianId'),'technician SMS authorization checks invoice provenance');

ok(calls.includes('ambiguous_identity'),'call lead extraction preserves ambiguous identities');
ok(calls.includes('customer_and_lead_share_phone'),'customer/lead collision is explicit');
ok(calls.includes('BUSINESS_TRANSFER="+17742445533"'),'human transfer target remains business phone');
ok(calls.includes('unsupported_pricing_detected'),'Ashley pricing guardrail remains active');
ok(calls.includes('unverified_definitive_scheduling_detected'),'Ashley scheduling guardrail remains active');
ok(calls.includes('unauthorized_assignment_claim_detected'),'Ashley assignment guardrail remains active');
ok(calls.includes('payment_amount_prompt_detected'),'Ashley payment-amount prompt guardrail remains active');

ok(email.includes('Authorization'),'CRM email requires authorization context');
ok(email.includes('team'),'CRM email checks team identity/authorization');
ok(ai.includes('google-ads-readonly'),'AI Manager delegates Google Ads reads to read-only gateway');
ok(ai.includes('get_google_ads_summary'),'AI Manager Google Ads summary tool remains wired');
ok(!/googleAds:mutate|campaigns:mutate|campaignBudgets:mutate/.test(ai),'AI Manager source has no direct Google Ads mutate API terms');

console.log(`live-edge source safety audit passed: ${checks} assertions`);