import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Run the actual Edge handler with synthetic Auth/DB adapters. No network, real
// invoices, production credentials, signatures, payments or messages are used.
// The DB adapter models current invoice RLS; actual policy verification is separate.
const source = readFileSync(new URL('../supabase/functions/invoice-email-preview/index.ts', import.meta.url), 'utf8');
const importLine = 'import { createClient } from "npm:@supabase/supabase-js@2";';
assert.equal(source.split(importLine).length - 1, 1);
const officeRoles = new Set(['owner', 'admin', 'dispatcher', 'office']);
const env = { SUPABASE_URL: 'https://db.example.invalid', SUPABASE_ANON_KEY: 'test-anon', SUPABASE_SERVICE_ROLE_KEY: 'test-service' };
function fixture() {
  const inv = (id, extra = {}) => ({ id, number: 'INV-DEMO', customer_name: 'Demo customer', customer_email: 'demo@example.invalid', date: '2026-09-27', due_term: 'On Receipt', items: [{ desc: 'Part', qty: 1, rate: 100, taxable: true }, { desc: 'Labor', qty: 1, rate: 50, taxable: false }], payments: [], tax_rate: 6.25, discount: 0, payment_provider: 'square', payment_link: 'https://square.link/u/demo', app_data: { squarePaymentLinkId: 'demo-link' }, deleted_at: null, ...extra });
  return {
    invoices: [inv('assigned', { job_id: 'job-own' }), inv('own-quickpay', { app_data: { squarePaymentLinkId: 'demo-link', createdByTechnicianId: 'tech-own' } }), inv('other', { job_id: 'job-other', customer_name: 'DO_NOT_EXPOSE_OTHER_CUSTOMER', customer_email: 'other@example.invalid' }), inv('deleted', { deleted_at: '2026-09-26' })],
    jobs: [{ id: 'job-own', technician_id: 'tech-own', deleted_at: null }, { id: 'job-other', technician_id: 'tech-other', deleted_at: null }],
    ai_manager_settings: [{ id: 'main', payment_instructions: { cash: { accepted: true } } }],
    settings: [{ id: 'main', email_logo_url: 'https://brand.example.invalid/logo.png', cc_surcharge_percent: 3.5 }]
  };
}
function runtime(options = {}, code = source) {
  const data = options.data || fixture();
  const original = JSON.stringify(data);
  const role = options.role || 'owner';
  const member = options.noMember ? null : { id: role === 'technician' ? 'tech-own' : 'team-' + role, auth_user_id: 'user-demo', status: options.inactive ? 'inactive' : 'active', role };
  const trace = [];
  const clients = [];
  let handler;
  function createClient(_url, key, clientOptions = {}) {
    const scope = key === env.SUPABASE_SERVICE_ROLE_KEY ? 'service' : 'scoped';
    clients.push({ scope, options: clientOptions });
    return {
      auth: { async getUser() {
        if (options.authThrows) throw new Error('PRIVATE_AUTH_INTERNALS');
        return { data: { user: options.invalidToken ? null : { id: 'user-demo' } }, error: options.authError ? { message: 'PRIVATE_AUTH_INTERNALS' } : null };
      } },
      from(table) {
        const filters = [];
        let columns = '';
        return {
          select(value) { columns = value; return this; },
          eq(key, value) { filters.push({ key, value, op: 'eq' }); return this; },
          is(key, value) { filters.push({ key, value, op: 'is' }); return this; },
          async maybeSingle() {
            trace.push({ scope, table, columns, filters: structuredClone(filters) });
            if (options.throwTable === table) throw new Error('PRIVATE_DATABASE_INTERNALS');
            if (options.failTable === table) return { data: null, error: { message: 'PRIVATE_DATABASE_INTERNALS', code: 'TEST_ERROR' } };
            let rows = table === 'team' ? (member ? [member] : []) : data[table];
            if (!rows) throw new Error('Unexpected table: ' + table);
            rows = rows.filter(row => filters.every(f => row[f.key] === f.value));
            if (scope === 'scoped' && table === 'invoices') {
              rows = rows.filter(row => officeRoles.has(role) || (role === 'technician' && (row.app_data?.createdByTechnicianId === member?.id || data.jobs.some(job => job.id === row.job_id && job.technician_id === member?.id && job.deleted_at === null))));
            }
            // Supabase select does not return columns outside the projection.
            const row = rows[0];
            const projected = row ? Object.fromEntries(columns.split(',').filter(k => k in row).map(k => [k, structuredClone(row[k])])) : null;
            return { data: projected, error: null };
          }
        };
      }
    };
  }
  const context = vm.createContext({ createClient, URL, Request, Response, console: { error() {} }, fetch() { throw new Error('Network calls are forbidden in this audit'); }, Deno: { env: { get: key => env[key] }, serve(fn) { handler = fn; } } });
  const executable = stripTypeScriptTypes(code.replace(importLine, ''), { mode: 'strip' });
  new vm.Script(executable, { filename: 'invoice-email-preview.ts' }).runInContext(context);
  assert.equal(typeof handler, 'function');
  return {
    trace, clients, data,
    async run(body = { invoice_id: 'assigned' }, requestOptions = {}) {
      const method = requestOptions.method || 'POST';
      const headers = { 'Content-Type': 'application/json' };
      if (!requestOptions.noAuthorization) headers.Authorization = requestOptions.authorization || 'Bearer synthetic-user-jwt';
      const init = { method, headers };
      if (method === 'POST') init.body = requestOptions.rawBody ?? JSON.stringify(body);
      const response = await handler(new Request('https://function.example.invalid', init));
      const text = await response.text();
      assert.equal(JSON.stringify(data), original, 'Preview must not mutate the synthetic business data');
      return { status: response.status, headers: response.headers, text, body: method === 'OPTIONS' ? null : JSON.parse(text) };
    }
  };
}
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
function noPrivilegedReads(r) { assert.equal(r.clients.filter(c => c.scope === 'service').length, 0); }
await check('OPTIONS has no Auth/DB side effects', async () => { const r = runtime(); assert.equal((await r.run(null, { method: 'OPTIONS' })).status, 200); assert.equal(r.clients.length, 0); });
await check('GET is rejected before Auth/DB access', async () => { const r = runtime(); assert.equal((await r.run(null, { method: 'GET' })).status, 405); assert.equal(r.clients.length, 0); });
await check('Missing user Authorization is rejected', async () => { const r = runtime(); assert.equal((await r.run(null, { noAuthorization: true })).status, 401); assert.equal(r.clients.length, 0); });
await check('Non-Bearer Authorization is rejected', async () => { const r = runtime(); assert.equal((await r.run(null, { authorization: 'Basic invalid' })).status, 401); assert.equal(r.clients.length, 0); });
for (const flag of ['invalidToken', 'authError']) await check(flag + ' fails closed', async () => { const r = runtime({ [flag]: true }); assert.equal((await r.run()).status, 401); assert.equal(r.trace.length, 0); noPrivilegedReads(r); });
for (const flag of ['noMember', 'inactive']) await check(flag + ' cannot preview invoices', async () => { const r = runtime({ [flag]: true }); assert.equal((await r.run()).status, 403); noPrivilegedReads(r); assert.ok(r.trace.every(t => t.table === 'team')); });
await check('Membership lookup errors expose no internal details', async () => { const r = runtime({ failTable: 'team' }); const x = await r.run(); assert.equal(x.status, 500); assert.doesNotMatch(x.text, /PRIVATE_/); noPrivilegedReads(r); });
await check('Malformed JSON is rejected without invoice/settings access', async () => { const r = runtime(); assert.equal((await r.run(null, { rawBody: '{' })).status, 400); assert.ok(r.trace.every(t => t.table === 'team')); noPrivilegedReads(r); });
await check('Missing, non-string, blank and overlong invoice IDs are rejected', async () => {
  for (const value of [undefined, null, 12, {}, [], '', '  ', 'x'.repeat(161)]) { const r = runtime(); assert.equal((await r.run({ invoice_id: value })).status, 400); assert.ok(r.trace.every(t => t.table === 'team')); noPrivilegedReads(r); }
});
for (const role of officeRoles) await check(role + ' can preview an allowed invoice', async () => { const r = runtime({ role }); const x = await r.run({ invoice_id: 'other' }); assert.equal(x.status, 200); assert.equal(x.body.invoice.id, 'other'); });
await check('Technician can preview an assigned-job invoice', async () => { assert.equal((await runtime({ role: 'technician' }).run()).status, 200); });
await check('Technician can preview their own Quick Payment invoice', async () => { assert.equal((await runtime({ role: 'technician' }).run({ invoice_id: 'own-quickpay' })).status, 200); });
await check('Technician cannot preview an unrelated invoice by ID', async () => { const r = runtime({ role: 'technician' }); const x = await r.run({ invoice_id: 'other' }); assert.equal(x.status, 404); assert.doesNotMatch(x.text, /DO_NOT_EXPOSE|other@example|square.link/); noPrivilegedReads(r); });
await check('Marketing Manager is not granted invoice access', async () => { const r = runtime({ role: 'marketing_manager' }); assert.equal((await r.run()).status, 404); noPrivilegedReads(r); });
await check('Unknown role receives no invoice access', async () => { const r = runtime({ role: 'unknown' }); assert.equal((await r.run()).status, 404); noPrivilegedReads(r); });
await check('Nonexistent and unauthorized invoices have identical responses', async () => { const a = await runtime({ role: 'technician' }).run({ invoice_id: 'other' }); const b = await runtime({ role: 'technician' }).run({ invoice_id: 'missing' }); assert.equal(a.status, b.status); assert.deepEqual(a.body, b.body); });
await check('Deleted invoices are unavailable even to Owner', async () => { const r = runtime(); assert.equal((await r.run({ invoice_id: 'deleted' })).status, 404); noPrivilegedReads(r); });
await check('Reassigned job revokes technician preview access', async () => { const data = fixture(); data.jobs[0].technician_id = 'tech-other'; const r = runtime({ role: 'technician', data }); assert.equal((await r.run()).status, 404); noPrivilegedReads(r); });
await check('Deleted linked job does not authorize technician preview', async () => { const data = fixture(); data.jobs[0].deleted_at = '2026-09-27'; const r = runtime({ role: 'technician', data }); assert.equal((await r.run()).status, 404); noPrivilegedReads(r); });
await check('Claimed role/creator in request body cannot bypass RLS', async () => { const r = runtime({ role: 'technician' }); assert.equal((await r.run({ invoice_id: 'other', role: 'owner', createdByTechnicianId: 'tech-own' })).status, 404); noPrivilegedReads(r); });
await check('Invoice lookup errors never fall back to service-role data', async () => { const r = runtime({ failTable: 'invoices' }); const x = await r.run(); assert.equal(x.status, 500); assert.doesNotMatch(x.text, /PRIVATE_/); noPrivilegedReads(r); });
await check('Thrown invoice lookup errors also fail closed', async () => { const r = runtime({ throwTable: 'invoices' }); const x = await r.run(); assert.equal(x.status, 500); assert.doesNotMatch(x.text, /PRIVATE_/); noPrivilegedReads(r); });
await check('Settings errors fail without leaking internals', async () => { const x = await runtime({ failTable: 'settings' }).run(); assert.equal(x.status, 500); assert.doesNotMatch(x.text, /PRIVATE_/); });
await check('Authorized invoice uses caller JWT and reads branding only afterward', async () => {
  const r = runtime({ role: 'technician' }); assert.equal((await r.run()).status, 200);
  assert.equal(r.clients[0].options.global.headers.Authorization, 'Bearer synthetic-user-jwt');
  assert.deepEqual(r.trace.map(t => [t.scope, t.table]), [['scoped', 'team'], ['scoped', 'invoices'], ['service', 'ai_manager_settings'], ['service', 'settings']]);
  assert.equal(r.trace[2].columns, 'payment_instructions'); assert.equal(r.trace[3].columns, 'email_logo_url,cc_surcharge_percent');
  assert.ok(r.trace[1].filters.some(f => f.key === 'deleted_at' && f.op === 'is' && f.value === null));
});
await check('Invoice ID whitespace is normalized without changing identity', async () => { const x = await runtime().run({ invoice_id: ' assigned ' }); assert.equal(x.status, 200); assert.equal(x.body.invoice.id, 'assigned'); });
await check('Success and denial responses cannot be cached', async () => { for (const id of ['assigned', 'missing']) { const x = await runtime().run({ invoice_id: id }); assert.equal(x.headers.get('cache-control'), 'no-store'); } });
await check('Existing mixed-tax, applied-principal and card-fee arithmetic is preserved', async () => {
  const data = fixture(); data.invoices[0].payments = [{ appliedAmount: 50, amount: 51.75, cardFee: 1.75, chargedAmount: 51.75 }];
  const x = await runtime({ data }).run(); assert.equal(x.status, 200); assert.equal(x.body.invoice.total, 156.25); assert.equal(x.body.invoice.balance, 106.25); assert.equal(x.body.payment.card_fee, 3.72); assert.equal(x.body.payment.total_with_card, 109.97);
});
await check('Authorized preview retains the logo and verified Square Pay Now button', async () => { const x = await runtime().run(); assert.equal(x.body.preview_only, true); assert.equal(x.body.payment.show_pay_now, true); assert.match(x.body.html, /PAY NOW/); assert.match(x.body.html, /brand.example.invalid/); });
await check('Unattested Square link remains rejected', async () => { const data = fixture(); data.invoices[0].app_data = {}; const x = await runtime({ data }).run(); assert.equal(x.body.payment.show_pay_now, false); });
await check('Customer text remains HTML-escaped', async () => { const data = fixture(); data.invoices[0].customer_name = '<script>alert(1)</script>'; const x = await runtime({ data }).run(); assert.doesNotMatch(x.body.html, /<script>/); assert.match(x.body.html, /&lt;script&gt;/); });
await check('Mutation control detects a service-role invoice-read regression', async () => {
  assert.ok(source.includes('scoped.from("invoices")'));
  const unsafe = source.replace('scoped.from("invoices")', 'createClient(url,service).from("invoices")');
  const r = runtime({ role: 'technician' }, unsafe); const x = await r.run({ invoice_id: 'other' });
  assert.equal(x.status, 200, 'Negative-control adapter must expose the service-role mistake');
  assert.equal(x.body.invoice.to, 'other@example.invalid');
  assert.throws(() => assert.equal(x.status, 404), 'The unauthorized-invoice assertion must catch this mutation');
});
console.log(`Invoice preview access audit: ${passed}/${passed} PASS (synthetic handler tests; no live delivery/payment calls)`);
