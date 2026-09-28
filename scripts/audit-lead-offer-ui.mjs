import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../lead-offer.js',import.meta.url),'utf8');
const dispatchSource=readFileSync(new URL('../lead-dispatch.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
function page(){
 const nodes=new Map(),calls=[],intervals=new Map(),events={},clock={now:Date.parse('2026-09-28T17:00:00Z')};
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:''});return nodes.get(id);};
 const document={hidden:false,getElementById:node,addEventListener:(event,fn)=>events[event]=fn};
 class TestDate extends Date{static now(){return clock.now;}}
 const ctx=vm.createContext({document,window:{addEventListener:(event,fn)=>events[event]=fn},location:{hash:'#'+'a'.repeat(43),reload(){events.reloaded=true;}},Date:TestDate,AbortSignal,
  setInterval:(fn,ms)=>intervals.set(ms,fn),fetch:(url,init)=>new Promise((resolve,reject)=>calls.push({body:JSON.parse(init.body),resolve,reject}))});
 vm.runInContext(source,ctx);
 const result=(status='pending',extra={})=>({status,zip:'01757',server_time:new Date(clock.now).toISOString(),expires_at:new Date(clock.now+300000).toISOString(),responded_channel:status==='accepted'?'sms':null,...extra});
 async function reply(index,status='pending',extra={}){calls[index].resolve({ok:true,json:async()=>({ok:true,offer:result(status,extra)})});await settle();}
 async function fail(index){calls[index].reject(Error('Synthetic network failure'));await settle();}
 return {node,calls,intervals,events,clock,reply,fail,click:id=>node(id).onclick()};
}
await test('a slow pre-acceptance status response cannot reopen the offer',async()=>{
 const p=page();await p.reply(0);p.intervals.get(5000)();p.click('accept');
 assert.equal(p.calls[2].body.action,'respond');await p.reply(2,'accepted');await p.reply(1);
 assert.equal(p.node('title').textContent,'You’re confirmed');assert.equal(p.node('actions').hidden,true);
 p.click('accept');assert.equal(p.calls.length,3);
});
await test('a stale failed status read cannot replace a saved response with an error',async()=>{
 const p=page();await p.reply(0);p.intervals.get(5000)();p.click('accept');await p.reply(2,'accepted');await p.fail(1);
 assert.equal(p.node('title').textContent,'You’re confirmed');assert.equal(p.node('feedback').textContent,'');
});
await test('background refresh preserves the explicit decline confirmation',async()=>{
 const p=page();await p.reply(0);p.click('decline');p.intervals.get(5000)();await p.reply(1);
 assert.equal(p.node('confirmDecline').hidden,false);assert.ok(p.calls.every(c=>c.body.action==='status'));
 p.click('confirmPass');assert.equal(p.calls[2].body.accept,false);await p.reply(2,'declined');assert.equal(p.node('actions').hidden,true);
});
await test('an answer from another channel closes the pending decline confirmation',async()=>{
 const p=page();await p.reply(0);p.click('decline');p.intervals.get(5000)();await p.reply(1,'accepted',{responded_channel:'whatsapp'});
 assert.equal(p.node('confirmDecline').hidden,true);assert.match(p.node('detail').textContent,/WhatsApp/);
});
await test('a timed-out response is read back before allowing a second decision',async()=>{
 const p=page();await p.reply(0);p.click('accept');await p.fail(1);assert.equal(p.calls[2].body.action,'status');
 await p.reply(2,'accepted');assert.equal(p.node('title').textContent,'You’re confirmed');assert.equal(p.calls.filter(c=>c.body.action==='respond').length,1);
});
await test('unknown response stays locked until reconnection confirms the outcome',async()=>{
 const p=page();await p.reply(0);p.click('accept');await p.fail(1);await p.fail(2);
 assert.equal(p.node('actions').hidden,true);assert.equal(p.node('retry').hidden,false);assert.equal(p.node('retry').disabled,false);
 p.clock.now+=360000;p.intervals.get(1000)();assert.equal(p.node('title').textContent,'Confirming your response');
 p.click('accept');assert.equal(p.calls.length,3);p.events.online();await p.reply(3,'accepted');assert.equal(p.node('title').textContent,'You’re confirmed');
});
await test('expiry immediately removes response controls and offers the app link',async()=>{
 const p=page();await p.reply(0);p.click('decline');p.clock.now+=301000;p.intervals.get(1000)();
 assert.equal(p.node('title').textContent,'This offer has expired');assert.equal(p.node('actions').hidden,true);assert.equal(p.node('confirmDecline').hidden,true);assert.equal(p.node('openApp').hidden,false);
 p.click('accept');assert.equal(p.calls.length,1);
});
await test('countdown uses the server clock when the device time is ahead',async()=>{
 const p=page(),serverTime=p.clock.now;p.clock.now+=3600000;
 await p.reply(0,'pending',{server_time:new Date(serverTime).toISOString(),expires_at:new Date(serverTime+300000).toISOString()});
 assert.equal(p.node('timer').textContent,'5:00 remaining');assert.equal(p.node('accept').disabled,false);
});
await test('initial load can recover after reconnecting without submitting a response',async()=>{
 const p=page();await p.fail(0);assert.equal(p.node('retry').hidden,false);p.events.online();await p.reply(1);
 assert.equal(p.node('title').textContent,'A new lead for you');assert.equal(p.node('retry').hidden,true);assert.ok(p.calls.every(c=>c.body.action==='status'));
});
await test('a different offer fragment reloads the page instead of reusing the old token',async()=>{
 const p=page();await p.reply(0);p.events.hashchange();assert.equal(p.events.reloaded,true);
});

function app({ready=true,role='technician'}={}){
 const events={},refreshes=[],navigation=[],renders=[];
 const ctx={console,dbReady:ready,CURRENT_TEAM_MEMBER:{id:'tech-test',role},route:{page:'dashboard',id:null},STORE:{leadOffers:[]},location:{hash:'#lead-offers',pathname:'/crm',search:''},
  document:{hidden:false,querySelector:()=>null,getElementById:()=>null,createElement:()=>({}),head:{append(){}},body:{append(){}},addEventListener:(event,fn)=>events[event]=fn},
  window:{addEventListener:(event,fn)=>events[event]=fn},setInterval(){},isMarketingManager:()=>ctx.CURRENT_TEAM_MEMBER.role==='marketing_manager',isTechnicianView:()=>true,
  render(){renders.push(ctx.route.page);},renderDashboard(){},renderJobDetail(){},createInvoiceFromJob(){},renderLeads(){},refreshCollection:async name=>{refreshes.push(name);},
  renderPreserveScroll(){ctx.render();},go(page){navigation.push(page);ctx.route={page,id:null};ctx.render();},history:{state:null,replaceState(){ctx.location.hash='';}}};
 vm.createContext(ctx);vm.runInContext(dispatchSource,ctx);return {ctx,events,refreshes,navigation,renders};
}
await test('lead link opens on the first authorized render with no polling delay',()=>{
 const a=app();a.ctx.render();assert.deepEqual(a.navigation,['leads']);assert.deepEqual(a.renders,['leads']);assert.equal(a.ctx.location.hash,'');
 a.ctx.route={page:'calendar',id:null};a.ctx.render();assert.equal(a.navigation.length,1);
});
await test('lead link waits for sign-in and loaded data, then preserves normal role checks',()=>{
 const a=app({ready:false});a.ctx.render();assert.equal(a.navigation.length,0);a.ctx.dbReady=true;a.ctx.render();assert.deepEqual(a.navigation,['leads']);
 const m=app({role:'marketing_manager'});m.ctx.render();assert.equal(m.navigation.length,0);
});
await test('another notification link can reopen offers within an existing session',()=>{
 const a=app();a.ctx.render();a.ctx.route={page:'calendar',id:null};a.ctx.location.hash='#lead-offers';a.events.hashchange();assert.deepEqual(a.navigation,['leads','leads']);
});
await test('returning to the app refreshes channel responses immediately',async()=>{
 const a=app();a.ctx.render();a.events.visibilitychange();await settle();assert.ok(a.refreshes.includes('leadOffers'));assert.ok(a.refreshes.includes('jobs'));
});
console.log(`Lead offer UI: ${passed} passed.`);
