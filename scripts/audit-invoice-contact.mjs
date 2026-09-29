import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('function promptContactInfo('),html.indexOf('window.emailDocument = emailDocument;',html.indexOf('function promptContactInfo(')));
async function check(role,type='invoice',error=null){
 let modal,calls=[],toast=[],closed=false;
 const context={CURRENT_TEAM_MEMBER:{role},document:{getElementById:()=>({value:' qa@example.invalid '})},showModal:v=>modal=v,
 getOne:(col)=>col==='customers'?{id:'customer'}:{id:'inv',customerId:'customer',rowVersion:7},
 SB:{rpc:async(name,args)=>{calls.push({name,args});return {data:error?null:{id:'inv',customer_email:'qa@example.invalid'},error};}},
 dbSet:async(...args)=>calls.push({db:args}),replaceStoreRecord:(...args)=>calls.push({replace:args}),
 closeModal:()=>closed=true,toast:(...v)=>toast.push(v),renderDocumentView:()=>{},normalizeToE164:v=>v};
 vm.runInNewContext(code,context);context.promptContactInfo(type,'inv','email');await modal.onSave();return {calls,toast,closed};
}
const tech=await check('technician');assert.equal(tech.calls[0].name,'technician_set_invoice_contact');assert.equal(tech.calls[0].args.p_expected_row_version,7);assert.equal(tech.calls[0].args.p_value,'qa@example.invalid');assert(!tech.calls.some(x=>x.db));assert(tech.closed);
const revoked=await check('technician','invoice',{message:'Active technician required'});assert(!revoked.closed);assert.equal(revoked.calls.length,1);assert.equal(revoked.toast[0][0],'Active technician required');
const estimate=await check('technician','estimate');assert.equal(estimate.calls.length,0);assert(!estimate.closed);
const owner=await check('owner');assert.equal(owner.calls.filter(x=>x.db).length,2);assert(owner.closed);
console.log('Invoice contact: scoped technician save, error handling, estimate guard and owner flow PASS');
