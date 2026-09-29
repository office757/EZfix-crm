import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const source=readFileSync(new URL('../lead-dispatch.js',import.meta.url),'utf8');
function fixture(overrides={},role='owner'){
 const lead={id:'qa-review-lead',name:'QA customer',phone:'+12025550100',address:'10 Test Street',zip:'01770',status:'new',...overrides};
 const calls=[],modals=[],toasts=[],opened=[],fields={dispatch_tech:{value:'qa-tech'},modalSaveBtn:{textContent:''}};
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

test('missing customer fields show a review action without an approval or send handler',()=>{
 const f=fixture({name:'',phone:' ',address:'',zip:''});f.offer();
 assert.equal(f.modals.length,1);assert.equal(f.modals[0].title,'Review before dispatch');assert.equal(f.modals[0].onSave,undefined);
 for(const field of ['Customer name','Phone','Service address','ZIP'])assert.ok(f.modals[0].body.includes(field));
 assert.deepEqual(f.calls,[]);
 const handler=f.modals[0].body.match(/onclick="([^"]+)"/)[1].replaceAll('&quot;','"');
 vm.runInContext(handler,f.c);assert.deepEqual(f.opened,['qa-review-lead']);assert.deepEqual(f.calls,[]);
});
test('the review prompt identifies only the fields requiring correction',()=>{
 const f=fixture({zip:'1770'});f.offer();assert.match(f.modals[0].body,/<li>ZIP \(5 digits or ZIP\+4\)<\/li>/);assert.equal((f.modals[0].body.match(/<li>/g)||[]).length,1);
});
test('placeholder referral names require review',()=>{
 const f=fixture({name:'New referral from QA source'});f.offer();assert.match(f.modals[0].body,/<li>Customer name<\/li>/);assert.deepEqual(f.calls,[]);
});
test('five-digit and ZIP+4 values allow technician selection but opening the form sends nothing',()=>{
 for(const zip of ['01770','01770-1234']){const f=fixture({zip});f.offer();assert.equal(f.modals[0].title,'Approve & offer lead');assert.equal(typeof f.modals[0].onSave,'function');assert.deepEqual(f.calls,[]);}
});
test('submission approves the lead before making one provider request',async()=>{
 const f=fixture();f.offer();await f.modals[0].onSave();
 assert.deepEqual(f.calls.map(x=>x.kind),['rpc','provider']);assert.equal(f.calls[0].name,'approve_lead_for_dispatch');
 assert.equal(f.calls[0].body.p_lead_id,f.lead.id);assert.equal(f.calls[1].body.lead_id,f.lead.id);assert.equal(f.calls[1].body.technician_id,'qa-tech');
});
test('no selected technician makes no approval or provider request',async()=>{
 const f=fixture();f.fields.dispatch_tech.value='';f.offer();await f.modals[0].onSave();assert.deepEqual(f.calls,[]);assert.equal(f.toasts[0][0],'Choose a technician');
});
test('customer details are rechecked immediately before submission',async()=>{
 const f=fixture();f.offer();f.c.STORE.leads=[{...f.lead,zip:''}];await f.modals[0].onSave();assert.equal(f.modals.at(-1).title,'Review before dispatch');assert.deepEqual(f.calls,[]);
});
test('a removed lead or changed office role cannot submit a stale modal',async()=>{
 for(const change of [f=>f.c.STORE.leads=[],f=>f.c.CURRENT_TEAM_MEMBER.role='technician']){const f=fixture();f.offer();change(f);await f.modals[0].onSave();assert.deepEqual(f.calls,[]);assert.equal(f.toasts.length,1);}
});
test('a backend rejection is visible and prevents a provider request',async()=>{
 const f=fixture();f.c.rpcResult={data:null,error:{message:'Lead is already assigned'}};f.offer();await f.modals[0].onSave();assert.deepEqual(f.calls.map(x=>x.kind),['rpc']);assert.deepEqual(f.toasts,[['Lead is already assigned',true]]);
});
test('a website-created appointment is not labeled as office approved',()=>{
 const f=fixture({convertedJobId:'qa-job',zip:''});const html=f.render();assert.match(html,/Appointment created — review before dispatch/);assert.match(html,/Review required/);assert.match(html,/Complete before dispatch: ZIP/);assert.ok(!html.includes('Approved for dispatch'));assert.match(html,/Open job/);
});
test('a completed office conversion retains its approved state',()=>{
 const f=fixture({status:'converted',convertedJobId:'qa-job',convertedCustomerId:'qa-customer'});assert.match(f.render(),/Approved for dispatch/);assert.match(f.render(),/Offer to technician/);
});
test('assigned leads and technician views do not get office review or send controls',()=>{
 const assigned=fixture({assignedTechnicianId:'qa-tech',zip:''});assert.ok(!assigned.render().includes('Review required'));assert.ok(!assigned.render().includes('Dispatch.offer('));
 const tech=fixture({},'technician');tech.offer();assert.equal(tech.modals.length,0);assert.deepEqual(tech.calls,[]);assert.ok(!tech.render().includes('Dispatch.offer('));
});
