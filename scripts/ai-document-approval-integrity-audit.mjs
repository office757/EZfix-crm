import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = new URL('../supabase/functions/ai-service-document-approval/index.ts', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8');

const text = (v) => String(v ?? '').trim();
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const allowedTypes = new Set(['invoice_draft', 'estimate_draft', 'receipt_draft']);

function recompute(draft) {
  const items = Array.isArray(draft?.items) ? draft.items : [];
  if (!items.length || items.length > 20) throw new Error('Draft must contain 1-20 line items');
  let subtotal = 0;
  let taxable = 0;
  for (const item of items) {
    const qty = Number(item?.qty);
    const rate = Number(item?.rate);
    if (!Number.isFinite(qty) || !Number.isFinite(rate) || !(qty > 0) || qty > 1000 || rate < 0 || rate > 1000000) throw new Error('Invalid draft line item');
    const line = qty * rate;
    subtotal += line;
    if (item?.taxable !== false) taxable += line;
  }
  const rawTaxRate = Number(draft?.totals?.tax_rate ?? draft?.tax_rate);
  if (!Number.isFinite(rawTaxRate) || rawTaxRate < 0 || rawTaxRate > 25) throw new Error('Invalid draft tax rate');
  const subtotalRounded = round2(subtotal);
  const tax = round2(taxable * rawTaxRate / 100);
  return { subtotal: subtotalRounded, tax_rate: rawTaxRate, tax, total: round2(subtotalRounded + tax) };
}

function canonicalizeCatalogItems(items, products) {
  const byId = new Map(products.map((product) => [String(product.id), product]));
  return items.map((item, index) => {
    const productId = text(item?.catalog_product_id);
    if (!productId) throw new Error(`Draft line ${index + 1} is missing catalog_product_id`);
    const product = byId.get(productId);
    if (!product || product.active === false) throw new Error(`Draft line ${index + 1} references an inactive or unknown catalog item`);
    const canonicalName = text(product.name);
    const canonicalCategory = text(product.category) || text(product.category_id);
    if (typeof product.taxable !== 'boolean') throw new Error(`Catalog item ${productId} has an invalid taxable classification`);
    const canonicalTaxable = product.taxable;
    if (!canonicalName) throw new Error(`Catalog item ${productId} is missing a name`);
    if (!canonicalCategory) throw new Error(`Catalog item ${productId} is missing a category`);
    if (text(item?.name) !== canonicalName) throw new Error( `Draft line ${index + 1} name does not match the active catalog; regenerate the draft`);
    if (item?.taxable !== false) !== canonicalTaxable) throw new Error(`Draft line ${index + 1} taxable classification does not match the active catalog; regenerate the draft`);
    if (text(item?.category) && canonicalCategory && text(item.category) !== canonicalCategory) throw new Error(`Draft line ${index + 1} category does not match the active catalog; regenerate the draft`);
    return { ...item, catalog_product_id: productId, name: canonicalName, category: canonicalCategory || text(item?.category), taxable: canonicalTaxable };
  });
}

function validateDraft(draft, products) {
  assert.equal(draft?.draft_only, true);
  assert.equal(draft?.needs_approval, true);
  if (!allowedTypes.has(text(draft?.document_type))) throw new Error('Unsupported AI service document type');
  const targetTotal = Number(draft?.target_total);
  if (!Number.isFinite(targetTotal) || targetTotal <= 0 || targetTotal > 1000000) throw new Error('Invalid target');
  const rawItems = Array.isArray(draft?.items) ? draft.items : [];
  if (!rawItems.length || rawItems.length > 20) throw new Error('Invalid item count');
  if (rawItems.some((item) => !text(item?.catalog_product_id))) throw new Error('Every draft line must reference an active catalog item');
  const items = canonicalizeCatalogItems(rawItems, products);
  const totals = recompute({ ...draft, items });
  const declaredTotal = Number(draft?.totals?.total);
  if (!Number.isFinite(declaredTotal)) throw new Error('Invalid declared total');
  if (Math.abs(totals.total - declaredTotal) >= 0.01 || Math.abs(totals.total - targetTotal) >= 0.01) throw new Error('Draft totals failed server-side reconciliation');
  return { items, totals };
}

const products = [
  { id: 's4t893fz3qyzcohqtn3u', name: 'Torsion Spring Replacement', category: 'Springs', category_id: 'springs', taxable: true, active: true },
  { id: 'jvdhcdrbgj4w3659bqr0', name: 'Garage Door Repair Labor', category: 'Labor', category_id: 'labor', taxable: false, active: true },
  { id: 'old', name: 'Old Product', category: 'Parts', category_id: 'parts', taxable: true, active: false },
];
const validDraft = {
  document_type: 'receipt_draft',
  draft_only: true,
  needs_approval: true,
  target_total: 750,
  totals: { tax_rate: 6.25, total: 750 },
  items: [
    { catalog_product_id: 's4t893fz3qyzcohqtn3u', name: 'Torsion Spring Replacement', category: 'Springs', qty: 1, rate: 502.99, taxable: true },
    { catalog_product_id: 'jvdhcdrbgj4w3659bqr0', name: 'Garage Door Repair Labor', category: 'Labor', qty: 1, rate: 215.57, taxable: false },
  ],
};

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };
const throws = (fn, pattern, message) => { assert.throws(fn, pattern, message); checks++; };

const validated = validateDraft(validDraft, products);
eq(validated.totals.subtotal, 718.56, 'spring/labor subtotal');
eq(validated.totals.tax, 31.44, 'MA tax only on taxable spring line');
eq(validated.totals.total, 750, 'tax-inclusive target reconciles');
eq(validated.items[1].taxable, false, 'labor remains non-taxable from catalog');

for (const type of ['invoice_draft', 'estimate_draft', 'receipt_draft']) {
  const draft = structuredClone(validDraft); draft.document_type = type;
  eq(validateDraft(draft, products).totals.total, 750, `${type} accepted`);
}

{ const d = structuredClone(validDraft); delete d.items[0].catalog_product_id; throws(() => validateDraft(d, products), /catalog item/, 'missing catalog id rejected'); }
{ const d = structuredClone(validDraft); d.items[0].catalog_product_id = 'unknown'; throws(() => validateDraft(d, products), /inactive or unknown/, 'unknown catalog id rejected'); }
{ const d = structuredClone(validDraft); d.items[0] = { ...d.items[0], catalog_product_id: 'old', name: 'Old Product', category: 'Parts' }; throws(() => validateDraft(d, products), /inactive or unknown/, 'inactive catalog item rejected'); }
{ const d = structuredClone(validDraft); d.items[0].taxable = false; throws(() => validateDraft(d, products), /taxable classification/, 'taxable flag tampering rejected'); }
{ const d = structuredClone(validDraft); d.items[1].taxable = true; throws(() => validateDraft(d, products), /taxable classification/, 'labor tax tampering rejected'); }
{ const d = structuredClone(validDraft); d.items[0].name = 'Premium Secret Spring'; throws(() => validateDraft(d, products), /name does not match/, 'catalog name tampering rejected'); }
{ const d = structuredClone(validDraft); d.items[0].category = 'Labor'; throws(() => validateDraft(d, products), /category does not match/, 'category tampering rejected'); }
{ const d = structuredClone(validDraft); d.items[0].category = ''; eq(validateDraft(d, products).items[0].category, 'Springs', 'empty category canonicalized from catalog'); }
{ const d = structuredClone(validDraft); d.document_type = 'refund_draft'; throws(() => validateDraft(d, products), /Unsupported/, 'unsupported document type rejected'); }
{ const d = structuredClone(validDraft); d.target_total = 0; throws(() => validateDraft(d, products), /Invalid target/, 'zero target rejected'); }
{ const d = structuredClone(validDraft); d.target_total = 1000001; throws(() => validateDraft(d, products), /Invalid target/, 'excessive target rejected'); }
{ const d = structuredClone(validDraft); d.totals.tax_rate = -1; throws(() => validateDraft(d, products), /Invalid draft tax rate/, 'negative tax rate rejected'); }
{ const d = structuredClone(validDraft); d.totals.tax_rate = 26; throws(() => validateDraft(d, products), /Invalid draft tax rate/, 'out-of-range tax rate rejected rather than clamped'); }
{ const d = structuredClone(validDraft); d.items[0].qty = 0; throws(() => validateDraft(d, products), /Invalid draft line item/, 'zero quantity rejected'); }
{ const d = structuredClone(validDraft); d.items[0].qty = 1001; throws(() => validateDraft(d, products), /Invalid draft line item/, 'extreme quantity rejected'); }
{ const d = structuredClone(validDraft); d.items[0].rate = -1; throws(() => validateDraft(d, products), /Invalid draft line item/, 'negative rate rejected'); }
{ const d = structuredClone(validDraft); d.items[0].rate = 1000001; throws(() => validateDraft(d, products), /Invalid draft line item/, 'extreme rate rejected'); }
{ const d = structuredClone(validDraft); d.items[0].rate = 'not-a-number'; throws(() => validateDraft(d, products), /Invalid draft line item/, 'non-numeric rate rejected'); }
{ const d = structuredClone(validDraft); d.items[0].qty = 'not-a-number'; throws(() => validateDraft(d, products), /Invalid draft line item/, 'non-numeric quantity rejected'); }
{ const d = structuredClone(validDraft); const badProducts = products.map((p) => p.id === 's4t893fz3qyzcohqtn3u' ? { ...p, taxable: null } : p); throws(() => validateDraft(d, badProducts), /invalid taxable classification/, 'catalog null taxable rejected'); }
{ const d = structuredClone(validDraft); const badProducts = products.map((p) => p.id === 's4t893fz3qyzcohqtn3u' ? { ...p, category: '', category_id: '' } : p); throws(() => validateDraft(d, badProducts), /missing a category/, 'catalog item without category rejected'); }
{ const d = structuredClone(validDraft); d.totals.total = 749.98; throws(() => validateDraft(d, products), /reconciliation/, 'declared-total tampering rejected'); }
{ const d = structuredClone(validDraft); d.target_total = 749.98; throws(() => validateDraft(d, products), /reconciliation/, 'target-total tampering rejected'); }

// Static source checks tie the executable model above back to the candidate Edge Function.
ok(source.includes('Every draft line must reference an active catalog item'), 'source requires catalog IDs for every line');
ok(source.includes('taxable classification does not match the active catalog'), 'source rejects taxable metadata tampering');
ok(source.includes('name does not match the active catalog'), 'source rejects product-name tampering');
ok(source.includes('category does not match the active catalog'), 'source rejects category tampering');
ok(source.includes('catalog_integrity_verified: true'), 'source records catalog-integrity verification');
ok(source.includes('.select("id,name,category,category_id,taxable,active")'), 'source retrieves canonical catalog metadata');
ok(!/from\(["']invoices[#']\)\s*\.(?:insert|update|upsert|delete)/.test(source), 'candidate does not write financial documents');
ok(!/send-crm-email|send-inkbox-sms|send-whatsapp-notification/.test(source), 'candidate does not send customer communications');
ok(source.includes('status: "pending"'), 'candidate only queues pending approval');
ok(source.includes('persisted_financial_document: false'), 'candidate explicitly reports no persisted financial document');

console.log(`PASS ${checks} approval/catalog-integrity assertions`);
