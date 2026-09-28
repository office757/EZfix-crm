import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';

// Execute the actual webhook with an isolated database adapter: no network,
// real contact details, provider delivery or production writes are involved.
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/website-lead-webhook/index.ts','utf8').replace(/^import .*\n/gm,''));
function fixture({scheduleFails=false}={}){
 const writes=[];let handler;
 const db={rpc:async(name,args)=>{if(name==='service_ensure_website_appointment'){writes.push({table:'appointment_rpc',data:args});return scheduleFails?{error:{message:'Synthetic scheduling failure'}}:{data:'job_synthetic'};}return {data:{allowed:true}};},from(table){
  const query={select:()=>query,eq:()=>query,is:()=>query,ilike:()=>query,gte:()=>query,limit:async()=>({data:[]}),
   insert:async data=>{writes.push({table,op:'insert',data});return {error:null};},
   upsert:async data=>{writes.push({table,op:'upsert',data});return {error:null};},
   update:data=>({eq:async()=>{writes.push({table,op:'update',data});return {error:null};}})};
  return query;
 }};
 const context={Request,Response,URL,TextEncoder,crypto:globalThis.crypto,console,createClient:()=>db,
  Deno:{serve:fn=>handler=fn,env:{get:key=>({SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic'}[key])}}};
 vm.createContext(context);vm.runInContext(source+'\nthis.parseAppointmentDate=parseDate;',context);
 return {writes,parse:context.parseAppointmentDate,run:async(body,form=false)=>handler(new Request('https://example.invalid',{method:'POST',headers:{'content-type':form?'application/x-www-form-urlencoded':'application/json'},body:form?new URLSearchParams(body):JSON.stringify(body)}))};
}
let count=0;
const fixedNow=new Date('2026-09-28T20:00:00Z');
const parsing=fixture();
for(const [input,expected] of [['09/29/2026','2026-09-29'],['9/29/2026','2026-09-29'],['2026-09-29','2026-09-29'],['02/29/2028','2028-02-29'],['2026-02-29',''],['2026-02-31',''],['8250-02-26',''],['2032-01-01',''],['2026-00-10',''],['2026-13-01',''],['2026-01-00',''],['2026-01-32',''],['not a date',''],['','']]){
 assert.equal(parsing.parse(input,fixedNow),expected,input);count++;
}
const lead={name:'Synthetic intake',phone:'+12025550148',service_type:'Spring repair',preferred_time:'8–10 AM'};
const date=(new Date().getUTCFullYear()+1)+'-01-15';
let f=fixture();let response=await f.run({...lead,preferred_date:date});
assert.equal(response.status,200);assert.equal(f.writes.find(x=>x.table==='leads').data.app_data.preferred_date,date);
assert.equal(f.writes.find(x=>x.table==='appointment_rpc').data.p_lead_id,f.writes.find(x=>x.table==='leads').data.id);
assert.equal(f.writes.find(x=>x.table==='ai_alerts').data.related_id,'job_synthetic');
assert.equal(f.writes.find(x=>x.table==='leads'&&x.op==='insert').data.app_data.date_needs_review,false);count++;
for(const input of ['8250-02-26','2026-02-31','01/33/2026']){
 f=fixture();response=await f.run({...lead,preferred_date:input});assert.equal(response.status,200);
 const saved=f.writes.find(x=>x.table==='leads'&&x.op==='insert').data;
 assert.equal(saved.app_data.preferred_date,null);assert.equal(saved.app_data.preferred_date_input,input);assert.equal(saved.app_data.date_needs_review,true);
 assert.ok(!f.writes.some(x=>x.table==='appointment_rpc'));assert.ok(f.writes.some(x=>x.table==='ai_alerts'&&x.data.rule_key==='website_date_needs_review'));count++;
}
f=fixture();await f.run({...lead,preferred_date:''});assert.ok(f.writes.some(x=>x.table==='leads'));assert.ok(!f.writes.some(x=>['appointment_rpc','ai_alerts'].includes(x.table)));count++;
f=fixture();await f.run({...lead,preferred_date:date,preferred_time:''});assert.ok(!f.writes.some(x=>x.table==='appointment_rpc'));count++;
f=fixture({scheduleFails:true});response=await f.run({...lead,preferred_date:date});assert.equal(response.status,200);assert.ok(f.writes.some(x=>x.table==='leads'));assert.ok(f.writes.some(x=>x.table==='ai_alerts'&&x.data.rule_key==='website_schedule_needs_review'));count++;
f=fixture();await f.run({...lead,'sms_consent[]':'on'},true);assert.equal(f.writes.find(x=>x.table==='sms_consent').data.status,'opted_in');count++;
f=fixture();await f.run(lead,true);assert.ok(!f.writes.some(x=>x.table==='sms_consent'));count++;
f=fixture();response=await f.run({...lead,name:''});assert.equal(response.status,400);assert.equal(f.writes.length,0);count++;
f=fixture();response=await f.run({...lead,website:'spam.example'});assert.equal(response.status,200);assert.equal(f.writes.length,0);count++;
console.log(`Website intake: ${count} real-handler/date cases PASS; invalid dates preserve the lead without creating an appointment`);
