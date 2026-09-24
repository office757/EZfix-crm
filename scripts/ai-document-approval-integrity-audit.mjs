import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../supabase/functions/ai-service-document-approval/index.ts', import.meta.url), 'utf8');
const text = (v) => String(v ?? '').trim();
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const throws = (fn, pattern, message) => { assert.throws(fn, pattern, message); checks += 1; };

function validate(items, products, taxRate = 6.25, targetTotal) {
  const byId = new Map(products.map((p) => [String(p.id), p]));
  let subtotal = 0;
  let taxable = 0;
  for (const [index, item] of items.entries()) {
    const id = text(item.catalog_product_id);
    if (!id) throw new Error('missing catalog id');
    const product = byId.get(id);
    if (!product || product.active !== true) throw new Error('inactive or unknown catalog item');
    if (typeof product.taxable !== 'boolean') throw new Error('invalid taxable classification');
    const name = text(product.name);
    const category = text(product.category) || text(product.category_id);
    if (!name || !category) throw new Error('invalid catalog identity');
    const catalogRateRaw = Number(product.rate);
    const draftRateRaw = Number(item.rate);
    const qty = Number(item.qty);
    if (!Number.isFinite(catalogRateRaw) || catalogRateRaw <= 0 || catalogRateRaw > 1000000) throw new Error('invalid catalog rate');
    if (!Number.isFinite(draftRateRaw) || draftRateRaw < 0 || draftRateRaw > 1000000) throw new Error('invalid draft rate');
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1000) throw new Error('invalid quantity');
    if (round2(catalogRateRaw) !== round2(draftRateRaw)) throw new Error(`line ${index + 1} rate mismatch`);
    if (text(item.name) !== name) throw new Error(`line ${index + 1} name mismatch`);
    if (text(item.category) !== category) throw new Error(`line ${index + 1} category mismatch`);
    if (typeof item.taxable !== 'boolean' || item.taxable !== product.taxable) throw new Error(`line ${index + 1} taxable mismatch`);
    const line = qty * round2(catalogRateRaw);
    subtotal += line;
    if (product.taxable) taxable += line;
  }
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 25) throw new Error('invalid tax rate');
  const tax = round2(taxable * taxRate / 100);
  const total = round2(round2(subtotal) + tax);
  if (targetTotal !== undefined && Math.abs(total - targetTotal) >= 0.01) throw new Error('reconciliation failed');
  return { subtotal: round2(subtotal), tax, total };
}

const products = [
  { id: 'spring', name: 'Torsion Spring Replacement', category: 'Springs', category_id: 'springs', rate: 500, taxable: true, active: true },
  { id: 'labor', name: 'Garage Door Repair Labor', category: 'Labor', category_id: 'labor', rate: 250, taxable: false, active: true },
];
const items = [
  { catalog_product_id: 'spring', name: 'Torsion Spring Replacement', category: 'Springs', qty: 1, rate: 500, taxable: true },
  { catalog_product_id: 'labor', name: 'Garage Door Repair Labor', category: 'Labor', qty: 1, rate: 250, taxable: false },
];

const totals = validate(items, products, 6.25, 781.25);
ok(totals.subtotal === 750, 'subtotal preserved from catalog rates');
ok(totals.tax === 31.25, 'tax applies only to taxable catalog line');
ok(totals.total === 781.25, 'catalog-priced total reconciles');
throws(() => validate([{ ...items[0], catalog_product_id: '' }, items[1]], products), /missing catalog id/, 'missing catalog id rejected');
throws(() => validate([{ ...items[0], rate: 499 }, items[1]], products), /rate mismatch/, 'caller-mutated rate rejected');
throws(() => validate(items, products.map((p) => p.id === 'spring' ? { ...p, rate: 0 } : p)), /invalid catalog rate/, 'zero catalog rate rejected');
throws(() => validate(items, products.map((p) => p.id === 'spring' ? { ...p, rate: null } : p)), /invalid catalog rate/, 'missing catalog rate rejected');
throws(() => validate([{ ...items[0], name: 'Changed Name' }, items[1]], products), /name mismatch/, 'catalog name tampering rejected');
throws(() => validate([{ ...items[0], category: 'Labor' }, items[1]], products), /category mismatch/, 'catalog category tampering rejected');
throws(() => validate([{ ...items[0], taxable: false }, items[1]], products), /taxable mismatch/, 'catalog taxability tampering rejected');
throws(() => validate(items, products.map((p) => p.id === 'spring' ? { ...p, taxable: null } : p)), /invalid taxable classification/, 'null catalog taxability rejected');
throws(() => validate([{ ...items[0], rate: 'x' }, items[1]], products), /invalid draft rate/, 'non-numeric rate rejected');
throws(() => validate([{ ...items[0], qty: 'x' }, items[1]], products), /invalid quantity/, 'non-numeric quantity rejected');
throws(() => validate(items, products, 26), /invalid tax rate/, 'out-of-range tax rejected');
throws(() => validate(items, products, 6.25, 781.24), /reconciliation failed/, 'tampered target total rejected');

const duplicateItems = [items[0], { ...items[0], qty: 2 }];
const duplicateTotals = validate(duplicateItems, products, 6.25, 1593.75);
ok(duplicateTotals.total === 1593.75, 'duplicate catalog product lines remain valid when each line is canonical');

ok(source.includes('ALLOWED_DOCUMENT_TYPES'), 'document type allowlist present');
ok(source.includes('Every draft line must reference an active catalog item'), 'every line requires catalog identity');
ok(source.includes('.select("id,name,category,category_id,rate,taxable,active")'), 'canonical catalog pricing and metadata are fetched');
ok(source.includes('catalogRateRaw <= 0'), 'missing or zero catalog rates fail closed');
ok(source.includes('rate does not match the active catalog'), 'draft/catalog rate mismatch fails closed');
ok(source.includes('typeof product.taxable !== "boolean"'), 'ambiguous catalog taxability fails closed');
ok(source.includes('typeof item?.taxable !== "boolean"'), 'draft taxability must be explicit boolean');
ok(source.includes('Number.isFinite(qty)') && source.includes('Number.isFinite(draftRateRaw)'), 'line amounts require finite numbers');
ok(source.includes('catalog_integrity_verified: true'), 'approval evidence records catalog verification');
ok(source.includes('pricing_verified: true'), 'approval evidence records pricing verification');
ok(source.includes('status: "pending"'), 'endpoint queues pending approval only');
ok(source.includes('persisted_financial_document: false'), 'endpoint reports no financial document persistence');
ok(!source.includes('productIds.length !== items.length'), 'duplicate catalog lines are not incorrectly rejected');
ok(!/from\(["']invoices["']\)\s*\.(?:insert|update|upsert|delete)/.test(source), 'endpoint has no invoice mutation');
ok(!/send-crm-email|send-inkbox-sms|send-whatsapp-notification/.test(source), 'endpoint sends no customer communication');

console.log(`PASS ${checks} AI document approval integrity assertions`);
