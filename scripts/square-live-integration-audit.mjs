import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const files=[
  'create-square-payment-link',
  'sync-square-payment',
  'square-webhook',
  'configure-square-webhook',
  'mark-receipt-delivery'
].map(slug=>[slug,fs.readFileSync(new URL(`../supabase/functions/${slug}/index.ts`,import.meta.url),'utf8')]);

const checks=[
 ['UI marks Square live',ui.includes("name: 'square'")&&ui.includes('isLive: true')],
 ['accepts square.link',ui.includes("u.hostname === 'square.link'")],
 ['accepts checkout.square.site',ui.includes("u.hostname === 'checkout.square.site'")],
 ['creates links through Edge Function',ui.includes("SB.functions.invoke('create-square-payment-link'")],
 ['syncs payments through Edge Function',ui.includes("SB.functions.invoke('sync-square-payment'")],
 ['missing link offers create Pay Now',ui.includes('CREATE PAY NOW')],
 ['stale no-live-Square copy removed',!ui.includes('there is no live Square API connection yet')],
 ['all live Square sources tracked',files.length===5&&files.every(([,src])=>src.includes('Deno.serve'))],
 ['webhook verifies signature',files.find(([n])=>n==='square-webhook')[1].includes('x-square-hmacsha256-signature')],
 ['webhook records verified payment',files.find(([n])=>n==='square-webhook')[1].includes('record_square_payment_from_webhook')],
 ['link function stores Square order identity',files.find(([n])=>n==='create-square-payment-link')[1].includes('squareOrderId')],
 ['receipt delivery requires paid invoice',files.find(([n])=>n==='mark-receipt-delivery')[1].includes('Invoice is not paid in full')]
];
let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`${passed}/${checks.length} assertions passed`);
if(passed!==checks.length)process.exit(1);
