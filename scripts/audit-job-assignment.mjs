import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function openJobModal('),html.indexOf('function invoiceTotal('));
function fixture(job,tech={id:'tech',name:'Actual technician',role:'Technician',status:'Active',authUserId:'login'}){
 const calls=[],elements={};
 const values={f_title:'Repair',f_customer:'customer',f_status:job?.status||'new',f_tech_id:'tech',f_tech_name:'stale name',f_date:'2026-10-01',f_window:'8–10 AM'};
 const document={getElementById:id=>elements[id]??=({value:values[id]||'',addEventListener(){}}),querySelectorAll:()=>[]};
 const context={window:{},document,console,STORE:{jobs:job?[job]:[],team:[tech],inspections:[],estimates:[]},getOne:(col,id)=>col==='team'?(id===tech.id?tech:null):col==='customers'?{id:'customer',name:'Customer'}:col==='jobs'?job:null,showModal:m=>context.modal=m,
 esc:v=>String(v||''),labelize:v=>v,customerPickerHtml:()=>'',technicianPickerHtml:()=>'',jobPhotoUploaderHtml:()=>'',handleJobPhotoInput(){},APPOINTMENT_WINDOWS:[],JOB_STATUSES:['new','completed'],CANCEL_REASONS:[],JOB_CHECKLIST_ITEMS:[],fmtDate:v=>v,
 dbSet:async(...args)=>calls.push(['set',...args]),dbAdd:async(...args)=>{calls.push(['add',...args]);return 'newjob';},logAudit(){},updateJobStatusWithHistory:async(...args)=>calls.push(['status',...args]),offerJobTechnician:async(...args)=>calls.push(['offer',...args]),syncJobAssignment:async(...args)=>calls.push(['sync',...args]),techWantsNotification:()=>false,toast:message=>calls.push(['toast',message]),closeModal:()=>calls.push(['close'])};
 vm.createContext(context);vm.runInContext(source,context);return {context,calls,values};
}
let f=fixture({id:'job',title:'Repair',customerId:'customer',status:'new',workflowVersion:0});
f.context.openJobModal('job');await f.context.modal.onSave();
assert.equal(f.calls.find(c=>c[0]==='set')[3].technician,'Actual technician');
assert.equal(f.calls.find(c=>c[0]==='set')[3].technicianId,'tech');
assert.ok(!('photos' in f.calls.find(c=>c[0]==='set')[3]),'untouched job photos must not overwrite newer uploads');
assert.ok(f.calls.some(c=>c[0]==='sync'));
f=fixture({id:'job',title:'Repair',customerId:'customer',status:'new',workflowVersion:1});
f.context.openJobModal('job');await f.context.modal.onSave();
assert.ok(!('technicianId' in f.calls.find(c=>c[0]==='set')[3]));
assert.equal(f.calls.find(c=>c[0]==='offer')[2],'tech');
assert.ok(!f.calls.some(c=>c[0]==='sync'));
assert.match(f.calls.find(c=>c[0]==='toast')[1],/pending/);
f=fixture({id:'job',customerId:'customer',status:'new',workflowVersion:1},{id:'tech',name:'No login',role:'Technician',status:'Active'});
f.context.openJobModal('job');await f.context.modal.onSave();assert.ok(!f.calls.some(c=>['set','offer'].includes(c[0])));
f=fixture(null);f.context.openJobModal(null,'customer',{requireTechnician:true,onSaved:id=>f.calls.push(['next',id])});await f.context.modal.onSave();
assert.equal(f.calls.find(c=>c[0]==='next')[1],'newjob');assert.ok(f.calls.findIndex(c=>c[0]==='close')<f.calls.findIndex(c=>c[0]==='next'));
f=fixture(null);f.values.f_tech_id='';f.context.openJobModal(null,'customer',{requireTechnician:true});await f.context.modal.onSave();assert.ok(!f.calls.some(c=>c[0]==='add'));
f=fixture(null);f.values.f_date='';f.context.openJobModal(null,'customer');await f.context.modal.onSave();assert.equal(f.calls.find(c=>c[0]==='add')[2].scheduledDate,null);
for(const date of ['8250-02-26','2026-02-31','2026-13-01','2026-1-1','invalid']){
 f=fixture(null);f.values.f_date=date;f.context.openJobModal(null,'customer');await f.context.modal.onSave();
 assert.ok(!f.calls.some(c=>c[0]==='add'),date+' cannot create an invalid appointment');
 assert.match(f.calls.find(c=>c[0]==='toast')[1],/valid scheduled date/);
}
f=fixture(null);f.values.f_date='2024-02-29';f.context.openJobModal(null,'customer');await f.context.modal.onSave();assert.equal(f.calls.find(c=>c[0]==='add')[2].scheduledDate,'2024-02-29');
for(const job of [null,{id:'job',customerId:'customer',status:'new',workflowVersion:0}]){
 f=fixture(job);f.values.f_status='completed';f.context.openJobModal(job?.id);
 assert.ok(!f.context.modal.body.includes('value="completed"'),'unfinished jobs must use signature flow');
 await f.context.modal.onSave();assert.ok(!f.calls.some(c=>['set','add','status'].includes(c[0])));
 assert.match(f.calls.find(c=>c[0]==='toast')[1],/Complete & Sign/);
}
f=fixture({id:'job',customerId:'customer',status:'completed',workflowVersion:0});f.context.openJobModal('job');
assert.ok(f.context.modal.body.includes('value="completed"'));await f.context.modal.onSave();assert.ok(f.calls.some(c=>c[0]==='set'),'existing completed job remains editable');
f=fixture({id:'job',customerId:null,customerName:'Website contact',source:'website_form',status:'scheduled',workflowVersion:0});
f.values.f_customer='';f.values.f_date='';f.values.f_status='new';f.context.openJobModal('job');await f.context.modal.onSave();
const websiteEdit=f.calls.find(c=>c[0]==='status')[3];assert.equal(websiteEdit.customerId,null);assert.equal(websiteEdit.customerName,'Website contact');assert.equal(websiteEdit.scheduledDate,null);
for(const job of [null,{id:'job',customerId:'customer',status:'new',workflowVersion:0}]){
 f=fixture(job);f.values.f_customer='';f.context.openJobModal(job?.id);await f.context.modal.onSave();assert.ok(!f.calls.some(c=>['set','add','status'].includes(c[0])),'new/linked jobs still require a customer');
}
const eligibility={window:{},getOne:()=>({role:'Technician',status:'Active'}),techStatus:t=>t.status};vm.createContext(eligibility);vm.runInContext(fs.readFileSync('job-assignment.js','utf8'),eligibility);
assert.equal(eligibility.window.jobHasEstimateTechnician({status:'new'}),false);
assert.equal(eligibility.window.jobHasEstimateTechnician({status:'new',technicianId:'tech'}),true);
assert.equal(eligibility.window.jobHasEstimateTechnician({status:'cancelled',technicianId:'tech'}),false);
console.log('Job assignment: actual job-form handlers, acceptance ordering and estimate prerequisites PASS');
