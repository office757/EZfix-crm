import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {DEFAULT_POLICY} from '../supabase/functions/_shared/dispatch-ranking.mjs';
const source=readFileSync(new URL('../ashley-routing.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const tech={id:'qa-tech',name:'QA Technician',role:'Technician',status:'Active',authUserId:'qa-login',commissionPercent:30};
const valid={enabled:true,dailyLimit:4,hourlyCost:0,commissionPercent:30,shifts:{1:[480,1080]},specialties:{spring:{skill:4,closeRate:70,averageTicket:500,durationMinutes:90,materialCost:100}},travelMinutesByZip:{'01757':20}};
async function fixture({member=tech,profile=null,role='owner',viewAs=false}={}){
 const calls=[],messages=[],nodes=new Map(),links=[];
 let modal=null,closed=false,saveError=null;
 const state={ok:true,policy:{mode:'recommend',config:structuredClone(DEFAULT_POLICY)},profiles:profile?[{technician_id:member.id,profile:structuredClone(profile)}]:[],decisions:[],paused:false};
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,innerHTML:'',style:{},checkValidity:()=>true,reportValidity(){},focus(){}});return nodes.get(id);};
 const ctx={console,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
  CURRENT_TEAM_MEMBER:{role},IS_OWNER:role==='owner',VIEW_AS:viewAs,STORE:{team:[member],leads:[]},route:{page:'receptionist'},receptionistState:{subview:'routing'},
  document:{getElementById:node},toast:(message,error)=>messages.push({message,error}),
  normalizeToE164:v=>/^\+1\d{10}$/.test(v||'')?v:'',whatsappRecipientState:t=>({ready:!!t.whatsappNumber&&t.whatsappOptIn===true}),
  renderAiReceptionist(){},renderTeam(){},renderLeads(){},isTechnicianView:()=>role==='technician',go(){},
  openTeamLoginAccess:id=>links.push(['login',id]),openTeamModal:id=>links.push(['contacts',id]),
  showModal:spec=>{modal=spec;closed=false;for(const tag of spec.body.matchAll(/<input\b[^>]*>/g)){const id=tag[0].match(/\bid="([^"]+)"/)?.[1];if(!id)continue;const n=node(id);n.value=tag[0].match(/\bvalue="([^"]*)"/)?.[1]||'';n.checked=/\schecked(?:\s|>)/.test(tag[0]);}const z=spec.body.match(/<textarea[^>]*id="apZips"[^>]*>([\s\S]*?)<\/textarea>/);if(z)node('apZips').value=z[1];},
  closeModal:()=>{closed=true;},SB:{functions:{invoke:async(name,{body})=>{calls.push(body);if(body.action==='save_profile'){if(saveError)return {data:null,error:saveError};state.profiles=[{technician_id:body.technician_id,profile:body.profile}];return {data:{ok:true}};}return {data:state};}}}
 };
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);ctx.Ashley.refresh();await settle();
 return {ctx,node,calls,messages,links,get html(){return node('receptionistBody').innerHTML;},get modal(){return modal;},get closed(){return closed;},setError:e=>{saveError=e;},save:async()=>{await modal.onSave();await settle();}};
}
let count=0;async function test(name,fn){await fn();count++;console.log('PASS',name);}
await test('missing profiles expose actionable setup and cannot enable automatic offers',async()=>{
 const f=await fixture({member:{...tech,authUserId:null}});assert.match(f.html,/0 \/ 1 ready/);assert.match(f.html,/6 setup steps remaining/);assert.match(f.html,/value="automatic"\s+disabled/);assert.match(f.html,/Create login/);
 f.ctx.Ashley.login(tech.id);f.ctx.Ashley.contacts(tech.id);assert.deepEqual(f.links,[['login',tech.id],['contacts',tech.id]]);
});
await test('readiness requires complete data even when the enabled flag is set',async()=>{
 const f=await fixture({profile:{...valid,travelMinutesByZip:{}}});assert.match(f.html,/0 \/ 1 ready/);assert.match(f.html,/1 setup steps remaining/);
});
await test('complete profile enables the automatic option without changing the saved mode',async()=>{
 const f=await fixture({profile:valid});assert.match(f.html,/1 \/ 1 ready/);assert.doesNotMatch(f.html,/value="automatic"[^>]*disabled/);assert.equal(f.calls.filter(c=>c.action==='save_policy').length,0);
});
await test('inactive technician never appears ready',async()=>{
 const f=await fixture({profile:valid,member:{...tech,status:'On Leave'}});assert.match(f.html,/0 \/ 1 ready/);assert.match(f.html,/Set active status/);
});
await test('new profiles have no invented sales, performance, costs or working days',async()=>{
 const f=await fixture();f.ctx.Ashley.editProfile(tech.id);
 for(const id of ['apLimit','apHourly','ap_spring_skill','ap_spring_closeRate','ap_spring_averageTicket','ap_spring_durationMinutes','ap_spring_materialCost'])assert.equal(f.node(id).value,'',id);
 for(let i=0;i<7;i++)assert.equal(f.node('apDay_'+i).checked,false);
 assert.equal(f.node('apCommission').value,'30');
});
await test('blank costs cannot silently become zero and the form stays open',async()=>{
 const f=await fixture({profile:valid});f.ctx.Ashley.editProfile(tech.id);f.node('apHourly').value='';await f.save();assert.equal(f.calls.filter(c=>c.action==='save_profile').length,0);assert.equal(f.closed,false);assert.match(f.messages.at(-1).message,/highlighted/);
});
await test('blank selected specialty estimates cannot silently become zero',async()=>{
 const f=await fixture({profile:valid});f.ctx.Ashley.editProfile(tech.id);f.node('ap_spring_materialCost').value='';await f.save();assert.equal(f.calls.filter(c=>c.action==='save_profile').length,0);
});
await test('explicit zero cost and a leading-zero ZIP are preserved',async()=>{
 const f=await fixture({profile:valid});f.ctx.Ashley.editProfile(tech.id);await f.save();const saved=f.calls.find(c=>c.action==='save_profile');assert.ok(saved);assert.equal(saved.profile.hourlyCost,0);assert.equal(saved.profile.travelMinutesByZip['01757'],20);assert.equal(f.closed,true);assert.match(f.html,/1 \/ 1 ready/);
});
await test('duplicate ZIPs cannot silently replace a travel estimate',async()=>{
 const f=await fixture({profile:valid});f.ctx.Ashley.editProfile(tech.id);f.node('apZips').value='01757=20\n01757=60';await f.save();assert.equal(f.calls.filter(c=>c.action==='save_profile').length,0);assert.match(f.messages.at(-1).message,/only once/);
});
await test('empty and inverted working hours are rejected before saving',async()=>{
 for(const end of ['', '07:00']){const f=await fixture({profile:valid});f.ctx.Ashley.editProfile(tech.id);f.node('apEnd_1').value=end;await f.save();assert.equal(f.calls.filter(c=>c.action==='save_profile').length,0);}
});
await test('server validation is shown and the profile is retained on a failed save',async()=>{
 const f=await fixture({profile:valid});f.ctx.Ashley.editProfile(tech.id);f.setError({message:'non-2xx',context:{json:async()=>({error:'Owner access required'})}});await f.save();assert.equal(f.closed,false);assert.equal(f.messages.at(-1).message,'Owner access required');assert.equal(f.node('ap_spring_averageTicket').value,'500');
});
await test('view-as and non-owner accounts cannot open setup actions',async()=>{
 for(const mode of [{role:'technician'},{viewAs:true}]){const f=await fixture(mode);f.ctx.Ashley.editProfile(tech.id);f.ctx.Ashley.login(tech.id);f.ctx.Ashley.contacts(tech.id);assert.equal(f.modal,null);assert.equal(f.links.length,0);}
});
await test('saved WhatsApp recipient details do not claim live provider delivery',async()=>{
 const f=await fixture({member:{...tech,whatsappNumber:'+12025550148',whatsappOptIn:true,notifyPrefs:{newLead:false}}});assert.match(f.html,/WhatsApp lead alerts off/);assert.match(f.html,/do not confirm delivery/);
});
await test('technician names remain text in the setup card and modal title',async()=>{
 const f=await fixture({member:{...tech,name:'<img src=x onerror=alert(1)>'}});f.ctx.Ashley.editProfile(tech.id);assert.doesNotMatch(f.modal.title,/<img/);assert.doesNotMatch(f.html,/<img/);
});
console.log(`Ashley technician setup: ${count} passed.`);
