import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../supabase/functions/ai-service-document-approval/index.ts', import.meta.url), 'utf8');
const text = (v) => String(v ?? '').trim();
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const allowedTypes = new Set(['invoice_draft', 'estimate_draft', 'receipt_draft']);
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const throws = (fn, re, m) => { assert.throws(fn, re, m); checks++; };

function verifyDraft(draft, products) {
  if (!allowedTypes.has(text(draft.document_type))) throw new Error('unsupported document type');
  const items = Array.isArray(draft.items) ? draft.items : [];
  if (!items.length || items.length > 20) throw new Error('item count');
  if (items.some((item) => !text(item.catalog_product_id))) throw new Error('missing product id');
  const uniqueIds = [...new Set(items.map((item) => text(item.catalog_product_id)))];
  const map = new Map(products.map((p) => [String(p.id), p]));
  if (uniqueIds.some((id) => !map.has(id))) throw new Error('unknown product');
  const verified = items.map((item) => {
    const p = map.get(text(item.catalog_product_id));
    if (p.active !== true) throw new Error('inactive');
    const name = text(p.name);
    const category = text(p.category) || text(p.category_id);
    if (!name || !category) throw new Error('catalog identity');
    if (typeof p.taxable !== 'boolean') throw new Error('catalog taxable');
    const catalogRate = Number(p.rate);
    const draftRate = Number(item.rate);
    const qty = Number(item.qty);
    if (!Number.isFinite(catalogRate) || catalogRate <= 0 || catalogRate > 1000000) throw new Error('catalog rate');
    if (!Number.isFinite(draftRate) || draftRate < 0 || draftRate > 1000000) throw new Error('draft rate');
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1000) throw new Error('qty');
    if (Math.abs(round2(catalogRate) - round2(draftRate)) >= 0.01) throw new Error('rate mismatch');
    if (typeof item.taxable !== 'boolean' || item.taxable !== p.taxable) throw new Error('taxable mismatch');
    if (text(item.name) && text(item.name) !== name) throw new Error('name mismatch');
    if (text(item.category) && text(item.category) !== category) throw new Error('category mismatch');
    return { ...item, name, category, taxable: p.taxable, qty, rate: draftRate };
  });
  const taxRate = Number(draft.totals?.tax_rate ?? draft.tax_rate);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 25) throw new Error('tax rate');
  const subtotal = round2(verified.reduce((s, x) => s + x.qty * x.rate, 0));
  const taxable = round2(verified.reduce((s, x) => s + (x.taxable ? x.qty * x.rate : 0), 0));
  const tax = round2(taxable * taxRate / 100);
  const total = round2(subtotal + tax);
  const declared = Number(draft.totals?.total);
  const target = Number(draft.target_total);
  if (!Number.isFinite(declared)) throw new Error('declared');
  if (!Number.isFinite(target) || target <= 0 || target > 1000000) throw new Error('target');
  if (Math.abs(total - declared) >= 0.01) throw new Error('declared mismatch');
  if (Math.abs(total - target) >= 0.01) throw new Error('target mismatch');
  if (draft.catalog_pricing_complete === false || draft.target_matches_catalog === false || draft.reconciled === false) throw new Error('review required');
  return { verified, subtotal, tax, total };
}

const products = [
  { id:'part', name:'Catalog Part', category:'Parts', category_id:'parts', rate:100, taxable:true, active:true },
  { id:'labor', name:'Catalog Labor', category:'Labor', category_id:'labor', rate:50, taxable:false, active:true },
];
const base = {
  document_type:'invoice_draft', draft_only:true, needs_approval:true,
  items:[{catalog_product_id:'part', name:'Catalog Part', category:'Parts', qty:1, rate:100, taxable:true}],
  totals:{tax_rate:6.25,total:106.25}, target_total:106.25, catalog_pricing_complete:true, target_matches_catalog:true, reconciled:true,
};

const r = verifyDraft(base, products);
eq(r.subtotal, 100, 'catalog subtotal');
eq(r.tax, 6.25, 'catalog tax');
eq(r.total, 106.25, 'catalog total');
for (const type of allowedTypes) { const d=structuredClone(base); d.document_type=type; eq(verifyDraft(d,products).total,106.25,`${type} accepted`); }
{ const d=structuredClone(base); d.document_type='refund_draft'; throws(()=>verifyDraft(d,products),/unsupported/,'unsupported document type blocked'); }
{ const d=structuredClone(base); delete d.items[0].catalog_product_id; throws(()=>verifyDraft(d,products),/missing product id/,'missing catalog id blocked'); }
{ const d=structuredClone(base); d.items[0].name='Different'; throws(()=>verifyDraft(d,products),/name mismatch/,'mislabeled item blocked'); }
{ const d=structuredClone(base); d.items[0].category='Labor'; throws(()=>verifyDraft(d,products),/category mismatch/,'category mismatch blocked'); }
{ const d=structuredClone(base); d.items[0].taxable=false; throws(()=>verifyDraft(d,products),/taxable mismatch/,'taxability tampering blocked'); }
{ const d=structuredClone(base); d.items[0].rate=99; d.totals.total=105.19; d.target_total=105.19; throws(()=>verifyDraft(d,products),/rate mismatch/,'invented/changed rate blocked'); }
{ const d=structuredClone(base); d.items[0].qty='x'; throws(()=>verifyDraft(d,products),/qty/,'non-numeric quantity blocked'); }
{ const d=structuredClone(base); d.totals.tax_rate=26; d.totals.total=126; d.target_total=126; throws(()=>verifyDraft(d,products),/tax rate/,'out-of-range tax blocked instead of clamped'); }
{ const d=structuredClone(base); d.target_total=107; throws(()=>verifyDraft(d,products),/target mismatch/,'target mismatch remains blocked'); }
{ const d=structuredClone(base); d.items=[...d.items, structuredClone(d.items[0])]; d.totals.total=212.5; d.target_total=212.5; const x=verifyDraft(d,products); eq(x.verified.length,2,'duplicate product IDs across legitimate separate lines are not mistaken for missing IDs'); }
{ const bad=products.map((p)=>p.id==='part'?{...p,rate:0}:p); throws(()=>verifyDraft(base,bad),/catalog rate/,'zero catalog pricing remains blocked'); }
{ const bad=products.map((p)=>p.id==='part'?{...p,taxable:null}:p); throws(()=>verifyDraft(base,bad),/catalog taxable/,'ambiguous catalog taxability fails closed'); }

ok(source.includes('ALLOWED_DOCUMENT_TYPES'), 'source has document-type allowlist');
ok(source.includes('.select("id,name,category,category_id,rate,taxable,active")'), 'source fetches canonical catalog identity and pricing');
ok(source.includes('catalog_identity_verified: true'), 'source records catalog identity verification');
ok(source.includes('draft_name_differs_from_catalog'), 'source rejects stale/mutated names');
ok(source.includes('draft_category_differs_from_catalog'), 'source rejects stale/mutated categories');
ok(source.includes('catalog_taxable_invalid'), 'source fails closed on ambiguous catalog taxability');
ok(source.includes('draft_rate_differs_from_catalog'), 'source preserves exact catalog-only pricing guard');
ok(source.includes('catalog_rate_missing_or_zero'), 'source preserves zero-rate block');
ok(source.includes('status: "pending"'), 'source only queues pending approval');
ok(source.includes('persisted_financial_document: false'), 'source reports no persisted financial document');
ok(!/from\(["']invoices["']\)\.(?:insert|update|upsert|delete)/.test(source), 'source does not mutate invoices');
ok(!/send-crm-email|send-inkbox-sms|send-whatsapp-notification/.test(source), 'source does not send customer communication');

console.log(`PASS ${checks} current-main AI approval hardening assertions`);
