import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const source=readFileSync(new URL('../lead-dispatch.js',import.meta.url),'utf8');
function fixture(overrides={},role='owner'){
 const lead={id:'qa-review-lead',name:'QA customer',phone:'+12025550100',address:'10 Test Street',zip:'01770',status:'new',...overrides};
 const calls=[],modals=[],toasts=[],opened=[],fields={dispatch_tech:{value:'qa-tech'},dispatch_zip:{value:lead.zip||'01770'},modalSaveBtn:{textContent:''}};
 const c={console,dbReady:true,CURRENT_TEAM_MEMBER:{id:'qa-office',role},IS_OWNER:role==='owner',VIEW_AS:'',
  STORE:{leads:[lead],team:[{id:'qa-tech',name:'QA technician',role:'Technician',status:'Active',authUserId:'qa-auth'}],leadOffers:[]},route:{page:'leads'},searchTerms:{},location:{hash:''},
  window:{addEventListener(){}},document:{getElementById:id=>fields[id]||null,querySelector:()=>null,createElement:()=>({}),head:{append(){}},body:{append(){}},addEventListener(){}},setInterval(){},
  render(){},renderLeads(){},renderDashboard(){},renderJobDetail(){},createInvoiceFromJob(){},renderWorkNavigation:()=>'',emptyState:()=>'',labelize:v=>v,
  isTechnicianView:()=>c.CURRENT_TEAM_MEMBER.role==='technician',isMarketingManager:()=>false,
  esc:v=>String(v??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k])),
  getOne:(collection,id)=>c.STORE[collection]?.find(row=>row.id===id),showModal:m=>modals.push(m),closeModal(){},openLeadModal:id=>opened.push(id),toast:(...args)=>toasts.push(args),refreshCollection:async()=>{},
  SB:{rpc:async(name,body)=>{calls.push({kind:'rpc',name,body});return c.rpcResult||{data:{ok:true},error:null};},functions:{invoke:async(name,request)=>{calls.push({kind:'provider',name,body:request.body});return {data:{ok:true},error:null};}}}};
 vm.createContext(c);vm.runInContext(source,c);
 return {c,lead,calls,modals,toasts,opened,fields,offer:()=>c.window.Dispatch.offer(lead.id),render:()=>{const content={};c.renderLeads(content,{});return content.innerHTML;}};
}

test('a website-created appointment is not labeled as office approved',()=>{
 const f=fixture({convertedJobId:'qa-job'});const html=f.render();assert.match(html,/Appointment created — review before dispatch/);assert.ok(!html.includes('Approved for dispatch'));assert.match(html,/Open job/);
});
test('a completed office conversion retains its approved state',()=>{
 const f=fixture({status:'converted',convertedJobId:'qa-job',convertedCustomerId:'qa-customer'});assert.match(f.render(),/Approved for dispatch/);assert.match(f.render(),/Offer to technician/);
});
test('partial conversion links do not imply completed office approval',()=>{
 for(const overrides of [{status:'converted',convertedJobId:'qa-job'},{status:'new',convertedJobId:'qa-job',convertedCustomerId:'qa-customer'}])assert.ok(!fixture(overrides).render().includes('Approved for dispatch'));
});
test('the list names missing details and ZIP confirmation remains available in the offer dialog',()=>{
 const f=fixture({name:'New referral from QA source',phone:' ',address:'',zip:''});const html=f.render();
 assert.match(html,/Complete before dispatch: Customer name, Phone, Service address, ZIP/);assert.match(html,/Review & dispatch/);
 const z=fixture({zip:'',address:'10 Test Street, Example MA 01770'});z.offer();assert.match(z.modals[0].body,/Service ZIP/);assert.match(z.modals[0].body,/value="01770"/);assert.deepEqual(z.calls,[]);
});
test('assigned, cancelled and technician views do not get office review warnings or send controls',()=>{
 for(const overrides of [{assignedTechnicianId:'qa-tech',zip:''},{status:'cancelled',zip:''}]){const html=fixture(overrides).render();assert.ok(!html.includes('Complete before dispatch'));assert.ok(!html.includes('Dispatch.offer('));}
 const tech=fixture({},'technician');tech.offer();assert.equal(tech.modals.length,0);assert.deepEqual(tech.calls,[]);assert.ok(!tech.render().includes('Dispatch.offer('));
});
test('pending offer state takes priority over the website appointment label',()=>{
 const f=fixture({convertedJobId:'qa-job'});f.c.STORE.leadOffers=[{id:'qa-offer',leadId:f.lead.id,status:'pending',expiresAt:new Date(Date.now()+300000).toISOString(),zip:'01770'}];
 const html=f.render();assert.match(html,/Offer awaiting response/);assert.ok(!html.includes('Appointment created — review before dispatch'));assert.match(html,/disabled[^>]+Dispatch.offer/);
});
test('a changed office role cannot submit an already-open send dialog',async()=>{
 const f=fixture();f.offer();f.c.CURRENT_TEAM_MEMBER.role='technician';await f.modals[0].onSave();assert.deepEqual(f.calls,[]);assert.deepEqual(f.toasts,[['Office access required',true]]);
});
test('a removed lead cannot submit an already-open send dialog',async()=>{
 const f=fixture();f.offer();f.c.STORE.leads=[];await f.modals[0].onSave();assert.deepEqual(f.calls,[]);assert.equal(f.toasts.length,1);assert.match(f.toasts[0][0],/Lead not available/);
});
