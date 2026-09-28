import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {modalDocument,modalSource} from './modal-test-fixture.mjs';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function harness(failAt=''){
  const calls=[],notices=[],routes=[],modals=[];
  const values={qpCustomer:'',qpClientName:'Synthetic test',qpClientPhone:'(508) 555-0123',qpClientEmail:'',qpClientAddress:'',qpNote:'',qpPartsCost:'0',qpPartsOwner:'company',qpJob:''};
  const buttons=[{disabled:false},{disabled:false}];
  const context=vm.createContext({console:{error:()=>{}},document:{getElementById:id=>({value:values[id]||''}),querySelectorAll:()=>buttons},
    quickPayNumbers:()=>({subtotal:100}),getOne:(col,id)=>col==='invoices'?{id,number:'TEST-ONLY'}:null,
    dbSet:async()=>{},SB:{rpc:async(name,args)=>{calls.push({name,args});if(failAt==='create')return {error:new Error('creation failed')};if(name==='record_quickpay_sms_consent'&&failAt==='consent')return {error:new Error('consent failed')};return {data:name==='record_quickpay_sms_consent'?{ok:true}:'test-invoice'};}},
    refreshCollection:async()=>{if(failAt==='refresh')throw Error('refresh failed');},
    PaymentProvider:{createPaymentRequest:inv=>inv.paymentLink.startsWith('https://square.link/')?inv.paymentLink:null,createPaymentLink:async id=>{calls.push({name:'checkout',id});if(failAt==='checkout')throw Error('checkout failed');return 'https://square.link/u/test-only';}},
    toast:(...args)=>notices.push(args),go:(...args)=>routes.push(args),showModal:m=>modals.push(m),
    confirm:()=>false,balanceDue:()=>100,money:n=>String(n),replaceStoreRecord:()=>{},esc:s=>s,location:{href:'https://example.test'},window:{},
    quickPaySetMethod:method=>vm.runInContext(`quickPayMethod=${JSON.stringify(method)}`,context)
  });
  vm.runInContext("let quickPayLines=[{desc:'Test',rate:100,qty:1}];let quickPayMethod='card';let quickPaySmsConsent=null;let quickPaySubmitting=false;",context);
  vm.runInContext(section('function normalizeToE164(', '// Exact match only.'),context);
  vm.runInContext(section('async function saveQuickPaySmsConsent(', 'window.quickPayCaptureSmsConsent='),context);
  vm.runInContext(section('async function quickPayCreateInvoice(', 'window.updateQuickPayPreview='),context);
  return {context,calls,notices,routes,modals,values,buttons,run:s=>vm.runInContext(s,context)};
}
let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
await check('Valid formatted phone reaches invoice and consent RPCs in the same normalized form',async()=>{
  const h=harness();h.run("quickPaySmsConsent={phone:'(508) 555-0123',signerName:'Test fixture',signatureDataUrl:'fixture-not-a-signature'}");
  await h.run('quickPayCreateInvoice()');
  assert.equal(h.calls[0].args.p_customer_phone,'+15085550123');
  assert.equal(h.calls[1].args.p_phone_e164,'+15085550123');
  assert.equal(h.modals.length,1);assert.match(h.modals[0].body,/href="https:\/\/square.link/);
});
await check('Phone changed after signature stops before any invoice write',async()=>{
  const h=harness();h.run("quickPaySmsConsent={phone:'+15085550999'}");await h.run('quickPayCreateInvoice()');
  assert.equal(h.calls.length,0);assert.match(h.notices[0][0],/Phone changed/);
});
await check('Failed creation preserves the editable draft and unlocks buttons',async()=>{
  const h=harness('create');await h.run('quickPayCreateInvoice()');
  assert.equal(h.run('quickPayLines.length'),1);assert.equal(h.routes.length,0);assert.ok(h.buttons.every(b=>!b.disabled));
});
for(const stage of ['refresh','consent','checkout'])await check(`Failure in ${stage} opens the saved invoice and prevents duplicate retry`,async()=>{
  const h=harness(stage);h.run("quickPaySmsConsent={phone:'+15085550123'}");await h.run('quickPayCreateInvoice()');
  assert.deepEqual(h.routes[0],['invoices','test-invoice']);assert.equal(h.run('quickPayLines.length'),0);
  assert.match(h.notices.at(-1)[0],/was created.*later step failed/);
  await h.run('quickPayCreateInvoice()');assert.equal(h.calls.filter(c=>c.name==='technician_create_quickpay_invoice').length,1);
});
await check('Concurrent taps share the in-flight guard',async()=>{
  const h=harness();let release;h.context.SB.rpc=()=>{h.calls.push({name:'create'});return new Promise(resolve=>{release=()=>resolve({data:'test-invoice'});});};
  const first=h.run('quickPayCreateInvoice()');await h.run('quickPayManualCard()');assert.equal(h.calls.length,1);
  release();await first;assert.equal(h.run('quickPaySubmitting'),false);
});
await check('Secure card button creates checkout through the existing provider',async()=>{
  const h=harness();h.run("quickPayMethod='cash'");await h.run('quickPayManualCard()');
  assert.equal(h.calls[0].args.p_preferred_payment_method,'card');assert.ok(h.calls.some(c=>c.name==='checkout'));
  assert.ok(h.modals[0].body.includes('Open Secure Square Checkout'));
});
await check('The real checkout dialog closes without an error or a second invoice write',async()=>{
  const h=harness();const dom=modalDocument();
  const originalGetElementById=h.context.document.getElementById;
  dom.document.querySelectorAll=()=>h.buttons;
  const modalGetElementById=dom.document.getElementById;
  dom.document.getElementById=id=>id.startsWith('modal')?modalGetElementById(id):originalGetElementById(id);
  Object.assign(h.context,dom);h.run(modalSource(source));
  await h.run('quickPayManualCard()');
  const overlay=dom.document.getElementById('modalOverlay');
  assert.match(overlay.innerHTML,/Invoice created — secure card checkout/);
  assert.match(overlay.innerHTML,/Open Secure Square Checkout/);
  assert.doesNotMatch(overlay.innerHTML,/>Cancel<|>Save</);
  const button=dom.document.getElementById('modalSaveBtn');assert.equal(button.textContent,'Close');
  await button.onclick();assert.equal(dom.document.getElementById('modalOverlay'),null);
  assert.equal(h.calls.filter(c=>c.name==='technician_create_quickpay_invoice').length,1);
  assert.ok(h.notices.every(n=>!n[1]));
});
console.log(`QuickPay recovery audit: ${checks}/${checks} PASS`);
