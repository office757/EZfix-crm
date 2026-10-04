import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const handler=html.slice(html.indexOf('function buildDocSmsText('),html.indexOf('function promptContactInfo('));
const normalize=html.slice(html.indexOf('function normalizeToE164('),html.indexOf('// Exact match only.',html.indexOf('function normalizeToE164(')));
async function scenario({phone='+1 (774) 555-0100',paid=false,type='invoice',linkFails=false,session=true,rejected=false}={}) {
  const sends=[],links=[],notices=[],audits=[];
  const doc={id:'synthetic',number:'QA-1',customerName:'QA',customerPhone:phone,items:[{qty:1,rate:100}]};
  const context={console:{error(){}},SUPABASE_PROJECT_URL:'https://example.invalid',SUPABASE_ANON_KEY:'synthetic',
    getOne:col=>col==='customers'?{}:doc,balanceDue:()=>paid?0:100,invoiceTotal:()=>100,estimateTotal:()=>100,
    money:n=>'$'+n,unwrapGoogleRedirect:v=>v,toast:(...args)=>notices.push(args),promptContactInfo:()=>{},
    createPublicInvoiceUrl:async id=>{links.push(id);if(linkFails)throw Error('Secure link unavailable');return 'https://example.invalid/invoice-pay.html?invoice=synthetic&token='+'a'.repeat(64);},
    SB:{auth:{getSession:async()=>({data:{session:session?{access_token:'synthetic'}:null}})}},
    fetch:async(_url,args)=>{sends.push(JSON.parse(args.body));return {ok:!rejected,json:async()=>rejected?{error:'Consent required'}:{success:true,providerMessageId:'synthetic'}};},
    logAudit:(...args)=>audits.push(args),SupabaseCommunicationBridge:null};
  vm.createContext(context);vm.runInContext(normalize+handler,context);await context.textDocument(type,'synthetic');
  return {sends,links,notices,audits};
}
let r=await scenario();assert.equal(r.sends.length,1);assert.equal(r.sends[0].to,'+17745550100');assert.match(r.sends[0].message,/View invoice, sign & pay: https:.*token=/);assert.match(r.sends[0].message,/STOP/);assert.equal(r.sends[0].entity_id,'synthetic');
r=await scenario({paid:true});assert.match(r.sends[0].message,/View paid invoice:/);assert.equal(r.sends[0].receipt_invoice_id,'synthetic');assert.doesNotMatch(r.sends[0].message,/sign & pay/);
r=await scenario({linkFails:true});assert.equal(r.sends.length,0);assert.match(r.notices[0][0],/Secure link unavailable/);
r=await scenario({phone:'invalid'});assert.equal(r.links.length,0);assert.equal(r.sends.length,0);
r=await scenario({session:false});assert.equal(r.links.length,0);assert.equal(r.sends.length,0);
r=await scenario({type:'estimate',linkFails:true});assert.equal(r.links.length,0);assert.equal(r.sends.length,1);assert.match(r.sends[0].message,/Estimate total/);
r=await scenario({rejected:true});assert.equal(r.sends.length,1);assert.equal(r.audits.length,0);assert.match(r.notices[0][0],/Consent required/);
console.log('Document SMS: 7 real-handler cases PASS; signed links, formatted phones, receipts, session and provider failures');
