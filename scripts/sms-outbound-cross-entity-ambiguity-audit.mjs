import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../supabase/functions/send-inkbox-sms/index.ts', import.meta.url), 'utf8');

function resolveCounts(customerMatches, leadMatches) {
  let customerId = null;
  let leadId = null;
  let ambiguous = false;
  if (customerMatches.length === 1 && leadMatches.length === 0) customerId = customerMatches[0].id;
  else if (customerMatches.length === 0 && leadMatches.length === 1) leadId = leadMatches[0].id;
  else if (customerMatches.length > 0 || leadMatches.length > 0) ambiguous = true;
  return { customerId, leadId, ambiguous };
}

const c = (id) => ({ id });
const l = (id) => ({ id });
const cases = [
  { name: 'no CRM match', customers: [], leads: [], expected: { customerId: null, leadId: null, ambiguous: false } },
  { name: 'one customer only', customers: [c('c1')], leads: [], expected: { customerId: 'c1', leadId: null, ambiguous: false } },
  { name: 'one lead only', customers: [], leads: [l('l1')], expected: { customerId: null, leadId: 'l1', ambiguous: false } },
  { name: 'customer and lead share phone', customers: [c('c1')], leads: [l('l1')], expected: { customerId: null, leadId: null, ambiguous: true } },
  { name: 'duplicate customers', customers: [c('c1'), c('c2')], leads: [], expected: { customerId: null, leadId: null, ambiguous: true } },
  { name: 'duplicate leads', customers: [], leads: [l('l1'), l('l2')], expected: { customerId: null, leadId: null, ambiguous: true } },
  { name: 'duplicate customers plus lead', customers: [c('c1'), c('c2')], leads: [l('l1')], expected: { customerId: null, leadId: null, ambiguous: true } },
  { name: 'customer plus duplicate leads', customers: [c('c1')], leads: [l('l1'), l('l2')], expected: { customerId: null, leadId: null, ambiguous: true } },
];

let checks = 0;
for (const test of cases) {
  assert.deepEqual(resolveCounts(test.customers, test.leads), test.expected, test.name);
  checks += 1;
}

assert.match(source, /cm\.length === 1 && lm\.length === 0/, 'unique customer requires zero lead matches'); checks += 1;
assert.match(source, /cm\.length === 0 && lm\.length === 1/, 'unique lead requires zero customer matches'); checks += 1;
assert.match(source, /cm\.length > 0 \|\| lm\.length > 0/, 'any non-unique or cross-entity match becomes ambiguous'); checks += 1;
assert.doesNotMatch(source, /if \(cm\.length === 1\) customerId = cm\[0\]\.id;\s*else if \(cm\.length > 1\) ambiguous = true;\s*else if \(lm\.length === 1\)/s, 'outbound SMS no longer prefers one customer over a colliding lead'); checks += 1;
assert.match(source, /const \{ customerId, leadId, ambiguous \} = await resolveParty\(admin, remote\);/, 'provider-success path uses guarded identity resolver'); checks += 1;
assert.match(source, /const \{ customerId, leadId, ambiguous \} = await resolveParty\(admin, to\);/, 'explicit provider-rejection persistence uses guarded identity resolver'); checks += 1;
assert.equal((source.match(/match_ambiguous: ambiguous/g) || []).length, 2, 'success and explicit-rejection rows both persist ambiguity'); checks += 1;
assert.match(source, /SMS accepted but CRM persistence failed; do not retry automatically/, 'unknown persistence outcome guard remains intact'); checks += 1;
assert.match(source, /SMS_PROVIDER_OUTCOME_UNKNOWN/, 'provider unknown-outcome guard remains intact'); checks += 1;
assert.match(source, /SMS_OPT_IN_REQUIRED/, 'consent guard remains intact'); checks += 1;
assert.match(source, /outbound_communication_approvals/, 'approval gate remains intact'); checks += 1;

console.log(`PASS ${checks} outbound SMS identity/safety assertions`);
