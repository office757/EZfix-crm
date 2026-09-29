import assert from 'node:assert/strict';
import {validDemoRun,validateDemoScope,runDemoStep} from '../supabase/functions/_shared/dispatch-demo.mjs';
const now=Date.now(), run={batch_id:'fixture',enabled:true,created_at:new Date(now).toISOString(),expires_at:new Date(now+60000).toISOString(),lead_ids:['l1'],technician_ids:['t1'],recipient_phone:'+12025550123'};
const lead={id:'l1',source:'Demo',app_data:{is_demo:true,demo_batch:'fixture'}};
const tech={id:'t1',role:'technician',status:'active',auth_user_id:'fixture',app_data:{is_demo:true,demo_batch:'fixture',demo_contact_owner_confirmed:true,whatsapp_opt_in:true,notify_prefs:{newLead:true},whatsapp_number:run.recipient_phone}};
assert.equal(validDemoRun(run),true);
for(const change of [{enabled:false},{expires_at:new Date(now-1).toISOString()},{expires_at:new Date(now+7200000).toISOString()},{lead_ids:[]},{recipient_phone:'bad'}])assert.equal(validDemoRun({...run,...change}),false);
validateDemoScope(run,[lead],[tech]);
for(const change of [{source:'AI Receptionist'},{id:'real-lead'},{app_data:{is_demo:true,demo_batch:'other'}},{deleted_at:'removed'}])assert.throws(()=>validateDemoScope(run,[{...lead,...change}],[tech]));
for(const change of [{whatsapp_number:'+12025550199'},{whatsapp_opt_in:false},{demo_contact_owner_confirmed:false},{demo_batch:'other'}])assert.throws(()=>validateDemoScope(run,[lead],[{...tech,app_data:{...tech.app_data,...change}}]));
function dbFor(offers=[],mode='automatic'){
 let commits=0,notifications=0;
 const tables={dispatch_demo_runs:run,dispatch_policy:{mode,config:{},updated_at:'policy'},ai_manager_settings:{paused:false},leads:[lead],team:[tech],lead_offers:offers,dispatch_decisions:[]};
 const db={from(name){const q={select(){return q},eq(){return q},in(){return q},maybeSingle(){return q},single(){return q},insert(v){tables[name].push(v);return q},then(resolve){return Promise.resolve({data:tables[name]}).then(resolve)}};return q},async rpc(){commits++;return {data:{id:'offer',lead_id:'l1',technician_id:'t1'}}}};
 const evaluate=async()=>({context:{jobs:[]},decision:{candidates:[{technician_id:'t1'}],winner:{technician_id:'t1'}}});
 const notify=async(_db,_offer,options)=>{assert.equal(options.demoRun,run);notifications++;return {whatsapp:{status:'queued'}}};
 return {db,evaluate,notify,counts:()=>({commits,notifications})};
}
for(const status of ['pending','expired','declined']){const f=dbFor([{lead_id:'l1',status}]);const r=await runDemoStep(f.db,'fixture',f.evaluate,f.notify);assert.equal(r.offered,0);assert.deepEqual(f.counts(),{commits:0,notifications:0});}
{const f=dbFor([],'recommend');assert.equal((await runDemoStep(f.db,'fixture',f.evaluate,f.notify)).state,'paused');assert.deepEqual(f.counts(),{commits:0,notifications:0});}
{const f=dbFor();assert.equal((await runDemoStep(f.db,'fixture',f.evaluate,f.notify)).offered,1);assert.deepEqual(f.counts(),{commits:1,notifications:1});}
{const f=dbFor();f.db.rpc=async()=>({error:'changed'});await assert.rejects(runDemoStep(f.db,'fixture',f.evaluate,f.notify));assert.equal(f.counts().notifications,0);}
console.log('Scoped demo: expiry, recipient/record isolation, pause, pending/expired deduplication and commit-before-notify PASS');
