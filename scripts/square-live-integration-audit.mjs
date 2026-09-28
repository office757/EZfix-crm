import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

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
 ['creates links through authenticated Edge Function',ui.includes('/functions/v1/create-square-payment-link')&&ui.includes('Bearer ${session.access_token}')],
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

const start=ui.indexOf('  async createPaymentLink(invoiceId) {');
const end=ui.indexOf('\n  // Look up a specific payment.',start);
assert.ok(start>=0&&end>start);
async function paymentLinkScenario({session=true,ok=true,data={ok:true,checkout_url:'https://checkout.square.site/qa'}}={}){
 const requests=[],refreshes=[];
 const context={SUPABASE_PROJECT_URL:'https://example.invalid',SUPABASE_ANON_KEY:'synthetic',SB:{auth:{getSession:async()=>({data:{session:session?{access_token:'synthetic-jwt'}:null}})}},
  fetch:async(url,options)=>{requests.push({url,options});return {ok,json:async()=>data};},refreshCollection:async name=>refreshes.push(name)};
 vm.createContext(context);vm.runInContext('this.provider={'+ui.slice(start,end)+'};',context);
 let value,error;try{value=await context.provider.createPaymentLink('qa-invoice');}catch(e){error=e;}
 return {value,error,requests,refreshes};
}
let r=await paymentLinkScenario();assert.equal(r.value,'https://checkout.square.site/qa');
assert.equal(r.requests[0].url,'https://example.invalid/functions/v1/create-square-payment-link');
assert.equal(r.requests[0].options.headers.Authorization,'Bearer synthetic-jwt');
assert.deepEqual(JSON.parse(r.requests[0].options.body),{invoice_id:'qa-invoice'});
assert.deepEqual(r.refreshes,['invoices']);
r=await paymentLinkScenario({session:false});assert.match(r.error.message,/session expired/);assert.equal(r.requests.length,0);
r=await paymentLinkScenario({ok:false,data:{error:'Provider unavailable',square_code:'TEST_ERROR'}});assert.match(r.error.message,/Provider unavailable \[TEST_ERROR\]/);assert.equal(r.refreshes.length,0);
r=await paymentLinkScenario({data:{ok:true}});assert.match(r.error.message,/link creation failed/);assert.equal(r.refreshes.length,0);
console.log('Square actual handler: invoice-bound request, session, provider failure and missing-link cases PASS (no live charge or API call)');
