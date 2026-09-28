import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Exercise the actual sender with synthetic provider/Auth/DB adapters. Never send
// a message, create a live token or use production credentials in this audit.
const source = readFileSync(new URL('../supabase/functions/send-inkbox-sms/index.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm, ''), { mode: 'strip' });
function runtime(options = {}) {
  let handler;
  const trace = [], sends = [];
  const role = options.role || 'owner';
  const invoice = {id:'invoice-test',number:'INV-TEST',customer_id:'customer-test',customer_phone:'+12025550148',job_id:'job-test',deleted_at:null,app_data:{},items:[{qty:1,rate:100,taxable:false}],tax_rate:6.25,discount:0,payments:[{appliedAmount:100,amount:103.5}],...options.invoice};
  const rows = {
    team:[{id:'team-test',auth_user_id:'user-test',role,status:'active'}],
    invoices:[invoice],jobs:[{id:'job-test',technician_id:'team-test',customer_id:'customer-test',deleted_at:null}],
    customers:[{id:'customer-test',phone:'+12025550148',deleted_at:null,app_data:{}}],leads:[],
    sms_consent:[{phone_e164:options.phone||'+12025550148',status:options.consent||'opted_in'}],
    sms_messages:[],invoice_sms_receipts:[]
  };
  const env={SUPABASE_URL:'https://database.example.invalid',SUPABASE_ANON_KEY:'anon-test',SUPABASE_SERVICE_ROLE_KEY:'service-test'};
  function createClient(_url,key){
    const scope=key==='service-test'?'service':'scoped';
    return {
      auth:{getUser:async()=>({data:{user:{id:'user-test'}}})},
      rpc:async(name,args)=>{assert.equal(name,'issue_public_invoice_access_token');assert.equal(scope,'scoped');assert.equal(args.p_invoice_id,invoice.id);trace.push({name,scope});return {data:{token:options.badToken?'invalid':'a'.repeat(64)}};},
      from(table){
        const filters=[];let mode='select',payload,single=false;
        const execute=async()=>{
          trace.push({scope,table,mode});
          if(options.failTable===table)return {data:null,error:{message:'Synthetic DB failure'}};
          if(mode==='insert'){assert.equal(scope,'service');rows[table].push(structuredClone(payload));return {data:null,error:null};}
          let found=(rows[table]||[]).filter(row=>filters.every(([k,v])=>row[k]===v));
          if(scope==='scoped'&&table==='invoices'&&options.denyInvoice)found=[];
          if(mode==='update')found.forEach(row=>Object.assign(row,payload));
          return {data:single?(found[0]||null):found,error:null};
        };
        return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},is(k,v){filters.push([k,v]);return this;},limit(){return this;},order(){return this;},insert(x){mode='insert';payload=x;return this;},update(x){mode='update';payload=x;return this;},maybeSingle(){single=true;return execute();},then(resolve,reject){return execute().then(resolve,reject);}};
      }
    };
  }
  class Inkbox {async getIdentity(){return {sendText:async payload=>{sends.push(payload);return {id:'provider-test',remotePhoneNumber:payload.to,deliveryStatus:options.providerStatus||'queued'};}};}}
  const context=vm.createContext({createClient,Inkbox,crypto,URL,Request,Response,console:{error(){}},fetch(){throw Error('Network forbidden');},Deno:{env:{get:key=>env[key]},serve(fn){handler=fn;}}});
  new vm.Script(executable).runInContext(context);
  return {sends,rows,trace,async run(body={},headers={Authorization:'Bearer synthetic-jwt'}){
    const requestBody={to:options.phone||'+12025550148',message:'CLIENT TEXT MUST NOT BECOME RECEIPT',entity_type:'invoices',entity_id:'invoice-test',receipt_invoice_id:'invoice-test',...body};
    const response=await handler(new Request('https://function.example.invalid',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(requestBody)}));
    return {status:response.status,body:await response.json()};
  }};
}
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
await check('Receipt sending requires an authenticated request',async()=>{const r=runtime();assert.equal((await r.run({},{})).status,401);assert.equal(r.sends.length,0);});
await check('Unpaid invoices cannot be sent as paid receipts',async()=>{const r=runtime({invoice:{payments:[]}});assert.equal((await r.run()).status,409);assert.equal(r.sends.length,0);});
await check('Card surcharge does not count as paid invoice principal',async()=>{const r=runtime({invoice:{payments:[{appliedAmount:97,amount:100.4}]}});assert.equal((await r.run()).status,409);assert.equal(r.sends.length,0);});
await check('SMS opt-out blocks receipts before provider access',async()=>{const r=runtime({consent:'opted_out'});assert.equal((await r.run()).status,409);assert.equal(r.sends.length,0);});
await check('Receipt destination must match the invoice customer',async()=>{const r=runtime({phone:'+12025550149'});assert.equal((await r.run()).status,403);assert.equal(r.sends.length,0);});
await check('Invoice RLS denial never falls back to privileged receipt reads',async()=>{const r=runtime({denyInvoice:true});assert.equal((await r.run()).status,403);assert.equal(r.sends.length,0);});
await check('Paid receipt uses a server-issued URL and records invoice correlation',async()=>{
 const r=runtime();const result=await r.run();assert.equal(result.status,200);assert.equal(r.sends.length,1);assert.doesNotMatch(r.sends[0].text,/CLIENT TEXT/);assert.match(r.sends[0].text,/Paid receipt INV-TEST/);assert.match(r.sends[0].text,/https:\/\/ezfix-crm-sms-length-fixed\.vercel\.app\/invoice-pay\.html\?invoice=invoice-test&token=a{64}/);assert.equal(r.rows.invoice_sms_receipts[0].invoice_id,'invoice-test');assert.equal(r.rows.invoice_sms_receipts[0].sms_message_id,r.rows.sms_messages[0].id);
});
await check('Assigned technician can send the paid job receipt',async()=>{const r=runtime({role:'technician'});assert.equal((await r.run()).status,200);assert.equal(r.sends.length,1);});
await check('Queued provider acceptance never claims delivery',async()=>{const r=runtime();assert.equal((await r.run()).body.delivered,false);assert.equal(r.rows.sms_messages[0].delivered_at,null);});
await check('Provider-confirmed delivery is preserved',async()=>{const r=runtime({providerStatus:'delivered'});assert.equal((await r.run()).body.delivered,true);assert.ok(r.rows.sms_messages[0].delivered_at);});
await check('Rejected sends cannot create receipt evidence',async()=>{const r=runtime({providerStatus:'failed'});assert.equal((await r.run()).status,502);assert.equal(r.rows.invoice_sms_receipts.length,0);});
await check('Tracking failure after sending forbids automatic retry',async()=>{const r=runtime({failTable:'invoice_sms_receipts'});const x=await r.run();assert.equal(x.status,500);assert.equal(x.body.accepted,true);assert.equal(x.body.retrySafe,false);assert.equal(r.sends.length,1);});
await check('Ordinary SMS retains its existing body without receipt evidence',async()=>{const r=runtime();assert.equal((await r.run({receipt_invoice_id:'',message:'Ordinary test message'})).status,200);assert.equal(r.sends[0].text,'Ordinary test message');assert.equal(r.rows.invoice_sms_receipts.length,0);});
await check('Invalid token prevents any receipt submission',async()=>{const r=runtime({badToken:true});assert.equal((await r.run()).status,503);assert.equal(r.sends.length,0);});
await check('Mixed tax and discount use the full paid amount',async()=>{const invoice={items:[{qty:1,rate:100,taxable:true},{qty:1,rate:50,taxable:false}],tax_rate:6.25,discount:15,payments:[{appliedAmount:140.63}]};assert.equal((await runtime({invoice}).run()).status,200);assert.equal((await runtime({invoice:{...invoice,payments:[{appliedAmount:140.60}]}}).run()).status,409);});
console.log(`Dispatch SMS receipt audit: ${passed}/${passed} PASS (synthetic provider only)`);
