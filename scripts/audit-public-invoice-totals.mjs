import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

/** Exercise the actual customer-page calculation using synthetic data only. */
export function auditInvoiceHtml(html) {
  const start = html.indexOf('function totals(i)');
  const end = html.indexOf('let drawing=false', start);
  assert.ok(start >= 0 && end > start, 'Could not locate the public invoice totals function');
  const context = vm.createContext({});
  new vm.Script(html.slice(start, end)).runInContext(context);
  const calculate = context.totals;
  const invoice = payments => ({items:[{qty:1,rate:1000,taxable:false}],payments,tax_rate:0,discount:0});
  let passed = 0;
  function check(name, run) { run(); passed++; console.log(`PASS ${name}`); }
  function paymentCase(name, payments, paid, balance) {
    check(name, () => { const result=calculate(invoice(payments)); assert.equal(result.paid,paid); assert.equal(result.balance,balance); });
  }
  paymentCase('Unpaid invoice', [], 0, 1000);
  paymentCase('Legacy amount-only payment', [{amount:500}], 500, 500);
  paymentCase('Modern applied-only payment', [{appliedAmount:500}], 500, 500);
  paymentCase('Partial card fee is not invoice principal', [{appliedAmount:500,amount:517.5,cardFee:17.5,chargedAmount:517.5}], 500, 500);
  paymentCase('Full card payment applies the exact balance', [{appliedAmount:1000,amount:1035,cardFee:35,chargedAmount:1035}], 1000, 0);
  paymentCase('Zero applied amount does not fall back to charge', [{appliedAmount:0,amount:35}], 0, 1000);
  paymentCase('Null applied amount falls back to legacy amount', [{appliedAmount:null,amount:100}], 100, 900);
  paymentCase('Numeric strings remain supported', [{appliedAmount:'500',amount:'517.50'}], 500, 500);
  paymentCase('Mixed card and legacy cash payments', [{appliedAmount:500,amount:517.5},{amount:100}], 600, 400);
  paymentCase('Charged-only amount is never applied as principal', [{chargedAmount:517.5}], 0, 1000);
  paymentCase('Missing payment array is safe', null, 0, 1000);
  paymentCase('Null legacy entries do not crash the page', [null,{}, {amount:100}], 100, 900);
  paymentCase('Overpayment still clamps balance to zero', [{appliedAmount:1200,amount:1242}], 1200, 0);
  check('Existing mixed-tax and discount arithmetic stays unchanged', () => {
    const result=calculate({items:[{qty:1,rate:200,taxable:true},{qty:1,rate:800,taxable:false}],tax_rate:6.25,discount:100,payments:[{appliedAmount:100,amount:103.5}]});
    assert.equal(result.subtotal,1000); assert.equal(result.discount,100); assert.equal(result.tax,11.25); assert.equal(result.total,911.25); assert.equal(result.balance,811.25);
  });
  check('Input invoice and payment history are not mutated', () => {
    const input=invoice([{appliedAmount:500,amount:517.5}]); const original=JSON.stringify(input); calculate(input); assert.equal(JSON.stringify(input),original);
  });
  check('All inline public-page scripts still parse', () => {
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if(match[1].trim()) new vm.Script(match[1]);
  });
  console.log(`Public invoice totals audit: ${passed}/${passed} PASS`);
  return {passed};
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  auditInvoiceHtml(readFileSync(new URL('../invoice-pay.html', import.meta.url),'utf8'));
}
