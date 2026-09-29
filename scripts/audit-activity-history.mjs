import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),source=fs.readFileSync(new URL('../activity-history.js',import.meta.url),'utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return html.slice(a,b);}
function fixture(){
  const c={IS_OWNER:true,isTechnicianView:()=>false,STORE:{team:[{id:'owner',name:'David'}],jobs:[{id:'j',title:'QA'}],auditLog:[
    {id:'old',action:'sent_email',summary:'Old summary',source:'app_client',entityType:'invoice',entityId:'i',createdByTeamId:'owner',createdAt:'2026-09-27T12:00:00Z'},
    {id:'new',action:'record_updated',summary:'Parts cost changed',source:'database',entityType:'jobs',entityId:'j',createdByTeamId:'owner',createdAt:'2026-09-29T12:00:00Z',details:{actor_name:'David at time of edit',before:{material_cost:200,status:'scheduled'},after:{material_cost:250,status:'cancelled'},changed_fields:['material_cost','status'],reason:'Customer rescheduled'}},
    {id:'middle',action:'sms_queued',summary:'SMS request queued',source:'app_client',entityType:'leads',createdAt:Date.parse('2026-09-28T12:00:00Z')}
  ]},window:{},money:n=>'$'+Number(n).toFixed(2),labelize:s=>String(s||'').replaceAll('_',' '),esc:v=>String(v??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k])),emptyState:(_,title)=>title,renderPreserveScroll(){c.renders=(c.renders||0)+1;},refreshCollection:async name=>{c.refreshed=name;},route:{page:'auditlog'},toast:message=>{c.notice=message;}};
  vm.createContext(c);vm.runInContext(section('function recordTimestamp(','function fmtDate(')+section('function payrollDateKey(','function reportJobTechnician(')+source,c);return c;
}
test('history shows actor snapshot, timestamp, record, reason and amount changes',()=>{
  const c=fixture(),content={};c.renderDetailedActivity(content,{});
  for(const text of ['David at time of edit','Customer rescheduled','$200.00','$250.00','Before','After','data-record="j"'])assert.ok(content.innerHTML.includes(text),text);
  assert.ok(content.innerHTML.indexOf('Parts cost changed')<content.innerHTML.indexOf('SMS request queued'));
});
test('older events identify missing fields instead of reconstructing them',()=>{
  const c=fixture(),content={};c.renderDetailedActivity(content,{});assert.match(content.innerHTML,/Field-level changes were not recorded/);assert.match(content.innerHTML,/Reason not recorded/);assert.match(content.innerHTML,/Actor not recorded/);
});
test('remote signatures identify the customer separately from the link creator',()=>{
  const c=fixture(),event={id:'signature',action:'invoice_signed_remote',source:'system',createdByTeamId:'owner',createdAt:'2026-09-29T13:00:00Z'};
  c.STORE.auditLog=[event];assert.equal(c.activityActor(event),'Customer · remote signature');const content={};c.renderDetailedActivity(content,{});assert.match(content.innerHTML,/Request or link created by/);assert.match(content.innerHTML,/David/);
});
test('provider callbacks are not presented as a human action',()=>{
  const c=fixture();assert.equal(c.activityActor({source:'provider',createdByTeamId:'owner'}),'Provider update');
});
test('CRM invoice preview is attributed to its requester without claiming a customer visit',()=>{
  const c=fixture(),event={id:'preview',action:'public_invoice_link_opened',summary:'Secure customer invoice page opened',source:'app_client',createdByTeamId:'owner'};
  c.STORE.auditLog=[event];const content={};c.renderDetailedActivity(content,{});
  assert.equal(c.activityActor(event),'David');assert.match(content.innerHTML,/Invoice Preview Requested/);assert.match(content.innerHTML,/customer viewing is not confirmed/);
  assert.equal(event.summary,'Secure customer invoice page opened');
});
test('search finds actor, reason and exact record IDs',()=>{
  for(const query of ['time of edit','rescheduled','j']){const c=fixture();c.window.ActivityHistory.filter('query',query);assert.ok(c.filteredActivityEvents().some(e=>e.id==='new'));}
  const c=fixture();c.window.ActivityHistory.filter('query','no match');assert.equal(c.filteredActivityEvents().length,0);
});
test('entity aliases and source filters select the intended events',()=>{
  const c=fixture();c.window.ActivityHistory.filter('entity','invoices');assert.deepEqual(Array.from(c.filteredActivityEvents(),e=>e.id),['old']);
  c.window.ActivityHistory.reset();c.window.ActivityHistory.filter('source','database');assert.deepEqual(Array.from(c.filteredActivityEvents(),e=>e.id),['new']);
  c.window.ActivityHistory.filter('source','other');assert.deepEqual(Array.from(c.filteredActivityEvents(),e=>e.id),['middle','old']);
});
test('date filters use the displayed calendar date and include both boundaries',()=>{
  const c=fixture();c.window.ActivityHistory.filter('from','2026-09-28');c.window.ActivityHistory.filter('to','2026-09-29');assert.deepEqual(Array.from(c.filteredActivityEvents(),e=>e.id),['new','middle']);
});
test('pagination exposes older events and resets when filters change',()=>{
  const c=fixture();c.STORE.auditLog=Array.from({length:105},(_,i)=>({id:String(i),action:'event',summary:'QA',createdAt:i+1}));const content={};c.renderDetailedActivity(content,{});assert.match(content.innerHTML,/Show 100 more/);
  c.window.ActivityHistory.more();c.renderDetailedActivity(content,{});assert.ok(!content.innerHTML.includes('Show 100 more'));assert.match(content.innerHTML,/showing 105/);
  c.window.ActivityHistory.filter('query','QA');c.renderDetailedActivity(content,{});assert.match(content.innerHTML,/showing 100/);
});
test('only actual changes appear; missing and null values are equivalent',()=>{
  const c=fixture(),changes=c.activityChanges({details:{before:{name:'same',amount:200},after:{name:'same',amount:null,absent:null}}});assert.equal(changes.length,1);assert.equal(changes[0].key,'amount');assert.equal(c.activityValue('amount',null),'—');
});
test('all free text, nested values and record links are escaped',()=>{
  const c=fixture(),content={};c.STORE.auditLog[1].details.reason='<script>unsafe</script>';c.STORE.auditLog[1].details.after.items=[{description:'<img src=x onerror=alert(1)>'}];c.renderDetailedActivity(content,{});assert.ok(!content.innerHTML.includes('<script>'));assert.match(content.innerHTML,/&lt;script&gt;/);assert.match(content.innerHTML,/&lt;img/);assert.match(content.innerHTML,/go\(this.dataset.page,this.dataset.record\)/);
});
test('owner preview and non-owner sessions cannot render or refresh history',async()=>{
  for(const preview of [false,true]){const c=fixture(),content={};c.IS_OWNER=preview;c.isTechnicianView=()=>preview;c.renderDetailedActivity(content,{});assert.equal(content.innerHTML,'Owner access only');await c.window.ActivityHistory.refresh();assert.equal(c.refreshed,undefined);}
});
test('refresh loads authoritative events and reports failures without losing saved data',async()=>{
  const c=fixture();await c.window.ActivityHistory.refresh();assert.equal(c.refreshed,'auditLog');assert.equal(c.renders,1);
  c.refreshCollection=async()=>{throw Error('offline');};await c.window.ActivityHistory.refresh();assert.match(c.notice,/Could not refresh/);assert.equal(c.STORE.auditLog.length,3);
});
test('production renderer and styles load the detailed history module',()=>{
  assert.match(html,/window.ActivityHistory.render\(content, actions\)/);assert.match(html,/<script src="\/activity-history.js"><\/script>/);assert.match(html,/<link rel="stylesheet" href="\/activity-history.css">/);
});
