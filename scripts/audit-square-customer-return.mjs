import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('supabase/functions/create-square-payment-link/index.ts','utf8');
const start=source.indexOf('const {data:access,error:accessError}');
const end=source.indexOf('const idempotencyKey',start);
assert.ok(start>0&&end>start);
for(const valid of [true,false]){
 const calls=[];
 const context={URL,CRM_PUBLIC_URL:'https://ezfix-crm-sms-length-fixed.vercel.app/',inv:{id:'qa_invoice'},sb:{rpc:async(name,args)=>{calls.push({name,args});return {data:{token:valid?'a'.repeat(64):'bad'},error:null}}}};
 vm.createContext(context);
 const run=vm.runInContext('(async()=>{'+source.slice(start,end)+'return redirectUrl.toString()})()',context);
 if(!valid){await assert.rejects(run,/secure invoice return/);continue;}
 const url=new URL(await run);assert.equal(url.pathname,'/invoice-pay');assert.equal(url.searchParams.get('invoice'),'qa_invoice');assert.equal(url.searchParams.get('token'),'a'.repeat(64));assert.equal(url.searchParams.get('square_return'),'1');assert.equal(calls[0].name,'issue_public_invoice_access_token');
}
console.log('PASS secure customer return route and invalid-token failure');
