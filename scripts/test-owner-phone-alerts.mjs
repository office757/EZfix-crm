import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {allowedOwnerPushEndpoint,ownerPushPayload,deliverOwnerLeadPush,handleOwnerLeadPush} from '../supabase/functions/_shared/owner-lead-push.mjs';
const row={id:'event',lead_id:'private-lead-id',team_id:'owner',subscription_id:'sub',subscription:{endpoint:'https://web.push.apple.com/test'},expires_at:new Date(Date.now()+3600000).toISOString()};
function delivery(opts={}){const sent=[],done=[],removed=[];return {sent,done,removed,deps:{eligible:async()=>opts.eligible!==false,send:async(...a)=>{sent.push(a);if(opts.error)throw opts.error;},finish:async(...a)=>done.push(a),removeSubscription:async id=>removed.push(id)}};}
test('endpoint restrictions reject arbitrary and deceptive network targets',()=>{for(const u of ['http://web.push.apple.com/a','https://localhost/a','https://web.push.apple.com.evil.com/a','https://fcm.googleapis.com/other','https://u:p@web.push.apple.com/a','https://web.push.apple.com:8080/a'])assert.equal(allowedOwnerPushEndpoint(u),false,u);for(const u of [row.subscription.endpoint,'https://fcm.googleapis.com/fcm/send/abc','https://updates.push.services.mozilla.com/wpush/v2/abc'])assert.equal(allowedOwnerPushEndpoint(u),true);});
test('new lead push contains no customer details or record identifiers',()=>{const p=ownerPushPayload({...row,name:'Private Customer',phone:'secret'});assert.equal(p.kind,'owner_lead');assert.equal(p.event_id,row.id);for(const value of ['private-lead-id','Private Customer','secret'])assert.ok(!JSON.stringify(p).includes(value));});
test('only eligible unexpired owner delivery reaches provider',async()=>{for(const [r,o,status]of [[row,{},'accepted'],[row,{eligible:false},'skipped'],[{...row,expires_at:'invalid'},{},'expired'],[{...row,subscription:{endpoint:'https://localhost/a'}},{},'failed']]){const f=delivery(o);assert.equal(await deliverOwnerLeadPush(r,f.deps),status);assert.equal(f.sent.length,status==='accepted'?1:0);assert.equal(f.done[0][1],status);}});
test('provider timeout is unconfirmed and never retried',async()=>{const f=delivery({error:Error('timeout')});assert.equal(await deliverOwnerLeadPush(row,f.deps),'unconfirmed');assert.equal(f.sent.length,1);assert.equal(f.removed.length,0);});
test('expired subscriptions removed; acceptance is not labelled delivered',async()=>{const f=delivery({error:{statusCode:410}});assert.equal(await deliverOwnerLeadPush(row,f.deps),'failed');assert.deepEqual(f.removed,['sub']);});
test('worker rejects unauthenticated requests before claiming queue',async()=>{for(const [method,secret,header]of [['GET','s','s'],['POST','',''],['POST','s','bad']]){let called=false;const r=await handleOwnerLeadPush(new Request('https://example.invalid',{method,headers:{'x-ezfix-cron-token':header}}),{secret,claim:async()=>{called=true},deliver(){}});assert.ok([401,405].includes(r.status));assert.equal(called,false);}});
test('authorized worker aggregates results without returning recipient data',async()=>{const r=await handleOwnerLeadPush(new Request('https://example.invalid',{method:'POST',headers:{'x-ezfix-cron-token':'s'}}),{secret:'s',claim:async()=>[row],deliver:async()=> 'accepted'});assert.deepEqual(await r.json(),{ok:true,processed:1,states:{accepted:1}});});
const frontend=fs.readFileSync('phone-alerts.js','utf8');
function browser(opts={}) {
 const messages=[],calls=[];
 const c={
  IS_OWNER:opts.role!=='technician', CURRENT_TEAM_MEMBER:{id:'me',role:opts.role||'owner'},
  isTechnicianView:()=>opts.preview||opts.role==='technician', toast:m=>messages.push(m),
  renderNotifPopover(){},render(){},location:{hash:''},dbReady:true,history:{},
  window:{PushManager:class{},Notification:{},addEventListener(){},Dispatch:{}},
  document:{getElementById:()=>null,createElement:()=>({append(){},style:{}})},Uint8Array,atob:()=> 'key',
  navigator:{serviceWorker:{register:async()=>({pushManager:{getSubscription:async()=>({endpoint:'https://web.push.apple.com/test',toJSON:()=>({})})}}),ready:Promise.resolve()}},
  Notification:{permission:opts.denied?'denied':'default',requestPermission:async()=>{calls.push('permission');return opts.dismiss?'default':'granted';}},
  SB:{
   functions:{invoke:async()=>{if(opts.accountChange)c.CURRENT_TEAM_MEMBER={id:'other',role:'owner'};return{data:{ok:true,public_key:'key'}};}},
   from:()=>({upsert:()=>{
    calls.push('save');return {select:async()=>opts.unconfirmed?{data:[]}:{data:[{id:'sub',team_id:'me'}]}};
   }})
  }
 };
 if(opts.unsupported)delete c.window.PushManager;
 vm.createContext(c);vm.runInContext(frontend,c);return{c,messages,calls};
}
test('page load never asks for permission; owner and technician can opt in',async()=>{for(const role of ['owner','technician']){const f=browser({role});assert.deepEqual(f.calls,[]);await f.c.window.PhoneAlerts.enable();assert.deepEqual(f.calls,['permission','save']);assert.match(f.messages.at(-1),/Phone alerts enabled/);}});
test('denied, unsupported and preview sessions never save a device',async()=>{for(const opts of [{denied:true},{unsupported:true},{preview:true},{dismiss:true},{accountChange:true}]){const f=browser(opts);await f.c.window.PhoneAlerts.enable();assert.ok(!f.calls.includes('save'));assert.ok(!f.messages.some(m=>m.startsWith('Phone alerts enabled')));}});
test('zero-row registration never announces enabled',async()=>{const f=browser({unconfirmed:true});await f.c.window.PhoneAlerts.enable();assert.match(f.messages.at(-1),/not confirmed/);});
const sw=fs.readFileSync('dispatch-sw.js','utf8');
test('service worker routes owner and technician separately and drops stale or malformed payloads',async()=>{const handlers={},shown=[];const c={URL,Date,self:{addEventListener:(n,fn)=>handlers[n]=fn,registration:{showNotification:async(...x)=>shown.push(x)},clients:{},location:{origin:'https://example.invalid'}}};vm.runInNewContext(sw,c);for(const data of [ownerPushPayload(row),{offer_id:'offer',expires_at:row.expires_at},{offer_id:'bad',expires_at:'bad'},{offer_id:'stale',expires_at:'2020-01-01'}]){let work;handlers.push({data:{json:()=>data},waitUntil:p=>work=p});await work;}assert.equal(shown.length,2);assert.equal(shown[0][1].data.url,'/crm#new-leads');assert.equal(shown[1][1].data.url,'/crm#lead-offers');});
