import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const code=stripTypeScriptTypes(readFileSync('supabase/functions/sync-inkbox-calls/index.ts','utf8').replace(/^import .*\n/gm,''));
function fixture({segments=[{party:'caller',text:'New service details'}],reject=false,existing=true,auth=true}={}){
  let handler,profileWrites=0,providerReads=0;
  const record=existing?{id:'stored',provider_call_id:'call123',transcript:[{party:'caller',text:'Previously saved details'}],summary:'Previously saved summary',lead_id:'lead',outcome:'converted',recording_url:null,recording_asset:null}:null;
  const writes=[];
  const call={id:'call123',status:'completed',startedAt:'2026-10-01T12:00:00Z',endedAt:'2026-10-01T12:01:00Z'};
  const identity={listCalls:async()=>{providerReads++;return [call]},listTranscripts:async()=>{if(reject)throw Error('provider unavailable');return segments},getHostedAgentConfig:async()=>({instructions:ctx.guardrailBlock('+17742445533')}),setHostedAgentConfig:async()=>profileWrites++};
  const db={from:name=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:name==='settings'?{ai_receptionist:{}}:record,error:null}),update:patch=>({eq:async()=>{writes.push(patch);Object.assign(record,patch);return {error:null}}}),insert:async row=>{writes.push(row);return {error:null}}})};
  class Inkbox {async ready(){return this}async getIdentity(){return identity}calls={get:async()=>call};}
  const ctx={Response,Request,Date,crypto:globalThis.crypto,console:{error(){},warn(){}},createClient:()=>db,Inkbox,Deno:{env:{get:k=>({EZFIX_CALL_SYNC_CRON_TOKEN:'test-cron',INKBOX_API_KEY:'test-key',SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'private'})[k]},serve:h=>handler=h}};
  vm.runInNewContext(code,ctx);
  return {record,writes,call:()=>handler(new Request('https://test.invalid',{method:'POST',headers:auth?{'x-ezfix-cron-token':'test-cron'}:{}})),get profileWrites(){return profileWrites},get providerReads(){return providerReads}};
}
test('temporary transcript API failure retains stored text and summary while refreshing status',async()=>{
  const f=fixture({reject:true}),r=await f.call();assert.equal(r.status,200);assert.equal(f.record.transcript[0].text,'Previously saved details');assert.equal(f.record.summary,'Previously saved summary');assert.equal(f.record.status,'completed');assert.equal(f.record.lead_id,'lead');assert.equal(f.record.outcome,'converted');assert.equal(f.profileWrites,0);
});
test('empty or malformed provider transcripts cannot erase existing conversation',async()=>{
  for(const segments of [[],null,{error:'unavailable'},[null]]){const f=fixture({segments}),r=await f.call();assert.equal(r.status,200);assert.equal(f.record.transcript[0].text,'Previously saved details');assert.equal(f.record.summary,'Previously saved summary');}
});
test('valid transcript refresh updates text and summary while preserving CRM links',async()=>{
  const f=fixture(),r=await f.call();assert.equal(r.status,200);assert.equal(f.record.transcript[0].text,'New service details');assert.equal(f.record.summary,'caller: New service details');assert.equal(f.record.lead_id,'lead');assert.equal(f.record.outcome,'converted');assert.equal(f.profileWrites,0);
});
test('new call with unavailable transcript is still saved for later reconciliation',async()=>{
  const f=fixture({existing:false,reject:true}),r=await f.call();assert.equal(r.status,200);assert.equal(f.writes.length,1);assert.equal(f.writes[0].provider_call_id,'call123');assert.equal(f.writes[0].transcript.length,0);assert.equal(f.writes[0].lead_id,null);
});
test('unauthorized call sync never reads the provider or writes records',async()=>{
  const f=fixture({auth:false}),r=await f.call();assert.equal(r.status,401);assert.equal(f.providerReads,0);assert.equal(f.writes.length,0);assert.equal(f.profileWrites,0);
});
