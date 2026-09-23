import assert from 'node:assert/strict';
import fs from 'node:fs';

const webhook = fs.readFileSync(new URL('../supabase/functions/inkbox-webhook/index.ts', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../supabase/functions/sync-inkbox-events/index.ts', import.meta.url), 'utf8');

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

for (const [name, source] of [['inkbox-webhook', webhook], ['sync-inkbox-events', sync]]) {
  assert.match(source, /cm\.length === 1 && lm\.length === 0/, `${name}: unique customer requires zero lead matches`);
  assert.match(source, /cm\.length === 0 && lm\.length === 1/, `${name}: unique lead requires zero customer matches`);
  assert.match(source, /cm\.length > 0 \|\| lm\.length > 0/, `${name}: any non-unique/cross-entity match becomes ambiguous`);
  assert.match(source, /match_ambiguous:/, `${name}: ambiguity is persisted on SMS rows`);
  checks += 4;
}

assert.doesNotMatch(webhook, /if \(cm\.length === 1\) customerId = cm\[0\]\.id;\s*else if \(cm\.length > 1\) ambiguous = true;\s*else if \(lm\.length === 1\)/s, 'webhook no longer prefers one customer over a colliding lead');
assert.doesNotMatch(sync, /if \(cm\.length === 1\) customerId = cm\[0\]\.id;\s*else if \(cm\.length > 1\) amb = true;\s*else if \(lm\.length === 1\)/s, 'sync no longer prefers one customer over a colliding lead');
checks += 2;

console.log(`PASS ${checks} SMS cross-entity identity assertions`);
