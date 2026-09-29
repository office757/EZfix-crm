import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function section(start,end){
  const from=html.indexOf(start),to=html.indexOf(end,from+start.length);
  assert.ok(from>=0 && to>from,`Missing production section: ${start}`);
  return html.slice(from,to);
}
const timestamps=section('function recordTimestamp(', 'function fmtDate(');
const reports=section('function teamPerformanceRows(', 'let payrollRange =');
const payroll=section('let payrollRange =', 'window.exportPayrollCSV = exportPayrollCSV;');
const timeline=section('function relatedEntityIdsForCustomer(', 'function commLabelFor(');
const history=section('function renderAuditLog(', 'async function saveSettings(');
const totals=section('function computeTotals(', 'function estimateTotal(');
const member=(id,name)=>({id,name,role:'Technician',commissionPercent:30});
const job=(id,technicianId,technician,extra={})=>({id,technicianId,technician,status:'completed',...extra});
const invoice=(id,jobId,rate=1000,extra={})=>({id,jobId,items:[{qty:1,rate,taxable:false}],payments:[{amount:rate/2}],...extra});
function runtime(overrides={}){
  const c={STORE:{team:[member('one','New name')],jobs:[job('j','one','Old name')],invoices:[invoice('i','j')],estimates:[],leads:[],customers:[],auditLog:[],calls:[],smsMessages:[],...overrides},window:{},IS_OWNER:true,canOperateOffice:()=>true,
    money:v=>Number(v).toFixed(2),esc:v=>String(v??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k])),fmtDate:String,labelize:String,emptyState:()=>'Denied or empty',
    COMMUNICATION_ACTIONS:new Set(['email_sent']),communicationChannelFor:()=>'email',communicationStatusFor:()=>'sent',derivedThreadId:(...args)=>args.join(':')};
  c.getOne=(collection,id)=>c.STORE[collection].find(row=>row.id===id);
  vm.createContext(c);
  vm.runInContext(timestamps+totals+section('function invoiceTotal(', 'function balanceDue(')+payroll+reports+timeline+history,c);
  return c;
}
test('Team Performance counts a renamed technician and job once',()=>{
  const c=runtime(),rows=c.teamPerformanceRows();
  assert.equal(rows.length,1);assert.equal(rows[0].name,'New name');
  assert.equal(rows[0].jobCount,1);assert.equal(rows[0].completed,1);
  assert.equal(rows[0].revenue,1000);assert.equal(rows[0].collected,500);
  const content={};c.renderReports(content,{});
  assert.match(content.innerHTML,/Revenue generated<\/div><div class="value">1000\.00/);
  assert.ok(!content.innerHTML.includes('Old name'));
});
test('same-name technicians have separate revenue and identifiable report rows',()=>{
  const c=runtime({team:[member('one','Alex'),member('two','Alex')],jobs:[job('j1','one','Alex'),job('j2','two','Alex')],invoices:[invoice('i1','j1'),invoice('i2','j2',1500)]});
  const rows=c.teamPerformanceRows();assert.equal(rows.length,2);
  assert.equal(rows.find(r=>r.memberId==='one').revenue,1000);
  assert.equal(rows.find(r=>r.memberId==='two').revenue,1500);
  const content={};c.renderReports(content,{});
  assert.match(content.innerHTML,/Team ID: one/);assert.match(content.innerHTML,/Team ID: two/);
});
test('unique legacy names join the saved team identity',()=>{
  const c=runtime({jobs:[job('j',null,'New name')]});
  const rows=c.teamPerformanceRows();assert.equal(rows.length,1);assert.equal(rows[0].memberId,'one');assert.equal(rows[0].revenue,1000);
});
test('ambiguous legacy assignments are counted once and labeled for review',()=>{
  const c=runtime({team:[member('one','Alex'),member('two','Alex')],jobs:[job('j',null,'Alex')]});
  const rows=c.teamPerformanceRows();assert.equal(rows.reduce((s,r)=>s+r.revenue,0),1000);
  assert.equal(rows.find(r=>r.unlinked).revenue,1000);
  assert.equal(rows.filter(r=>!r.unlinked).reduce((s,r)=>s+r.revenue,0),0);
  const content={};c.renderReports(content,{});assert.match(content.innerHTML,/review technician identity/);
});
test('historical IDs remain grouped when the roster entry is unavailable',()=>{
  const c=runtime({team:[],jobs:[job('j','missing','Old'),job('j2','missing','Older')],invoices:[invoice('i','j'),invoice('i2','j2',2000)]});
  const rows=c.teamPerformanceRows();assert.equal(rows.length,1);assert.equal(rows[0].jobCount,2);assert.equal(rows[0].revenue,3000);
});
test('report excludes deleted jobs, deleted invoices and unassigned invoices',()=>{
  const c=runtime({jobs:[job('j','one','New name'),job('gone','one','New name',{deletedAt:1})],invoices:[invoice('i','j'),invoice('i2','j',250),invoice('gone','j',700,{deletedAt:1}),invoice('goneJob','gone'),invoice('unlinked',null)]});
  const row=c.teamPerformanceRows()[0];assert.equal(row.jobCount,1);assert.equal(row.invoiceCount,2);assert.equal(row.revenue,1250);assert.equal(row.collected,625);
});
test('Team Performance preserves invoice tax totals and applied-payment accounting',()=>{
  const c=runtime({invoices:[invoice('i','j',1000,{items:[{qty:1,rate:1000,taxable:true}],taxRate:6.25,discount:100,payments:[{amount:103.5,appliedAmount:100,cardFee:3.5}]})]});
  const row=c.teamPerformanceRows()[0];assert.equal(row.revenue,956.25);assert.equal(row.collected,100);
});
test('report renderer retains the office access gate and escapes names',()=>{
  const c=runtime({team:[member('one','<unsafe>')]}),content={};
  c.renderReports(content,{});assert.match(content.innerHTML,/&lt;unsafe&gt;/);assert.ok(!content.innerHTML.includes('<unsafe>'));
  c.canOperateOffice=()=>false;c.renderReports(content,{});assert.equal(content.innerHTML,'Denied or empty');
});
test('audit history orders mixed database strings and local numbers, without mutating stored rows',()=>{
  const auditLog=[{id:'old',action:'OldEvent',summary:'old',createdAt:'2026-09-27T20:00:00Z'},{id:'unknown',action:'UnknownEvent',summary:'unknown',createdAt:'bad-date'},{id:'new',action:'NewEvent',summary:'new',createdAt:'2026-09-29T10:00:00-04:00'},{id:'middle',action:'MiddleEvent',summary:'middle',createdAt:Date.parse('2026-09-28T12:00:00Z')}];
  const c=runtime({auditLog}),before=JSON.stringify(auditLog),content={};c.renderAuditLog(content,{});
  const positions=['NewEvent','MiddleEvent','OldEvent','UnknownEvent'].map(s=>content.innerHTML.indexOf(s));
  assert.ok(positions.every((p,i)=>p>=0 && (!i || p>positions[i-1])));assert.equal(JSON.stringify(auditLog),before);
});
test('history limit retains the newest 200 rows after parsing server timestamps',()=>{
  const auditLog=Array.from({length:205},(_,i)=>({id:String(i),action:'event',summary:`event-${String(i).padStart(3,'0')}`,createdAt:new Date(Date.UTC(2026,8,1,0,i)).toISOString()}));
  const c=runtime({auditLog}),content={};c.renderAuditLog(content,{});
  assert.equal((content.innerHTML.match(/event-\d{3}/g)||[]).length,200);
  assert.ok(content.innerHTML.includes('event-204'));assert.ok(content.innerHTML.includes('event-005'));assert.ok(!content.innerHTML.includes('event-004'));
});
test('audit history remains owner-only',()=>{
  const c=runtime(),content={};c.IS_OWNER=false;c.renderAuditLog(content,{});assert.equal(content.innerHTML,'Denied or empty');
});
test('customer and global communications interleave calls, SMS and audit dates correctly',()=>{
  const c=runtime({customers:[{id:'customer',name:'QA'}],leads:[{id:'lead',convertedCustomerId:'customer'}],auditLog:[{id:'audit',action:'email_sent',entityId:'customer',createdAt:'2026-09-29T10:00:00Z'}],calls:[{id:'call',leadId:'lead',createdAt:Date.parse('2026-09-29T12:00:00Z')}],smsMessages:[{id:'sms',customerId:'customer',direction:'inbound',receivedAt:'2026-09-29T11:00:00Z'}]});
  assert.deepEqual(Array.from(c.buildCommunicationTimeline('customers','customer'),r=>r.id),['call','sms','audit']);
  assert.deepEqual(Array.from(c.buildGlobalCommunicationTimeline(),r=>r.id),['call','sms','audit']);
});
test('timestamp conversion handles timezone offsets and invalid or absent dates',()=>{
  const c=runtime();assert.equal(c.recordTimestamp('2026-09-29T10:00:00-04:00'),Date.parse('2026-09-29T14:00:00Z'));
  for(const value of [null,undefined,'', 'invalid',NaN,Infinity])assert.equal(c.recordTimestamp(value),0);
});
test('all corrected list comparators run on mixed server/local timestamps in their intended direction',()=>{
  const c=runtime();
  const comparators=[...html.matchAll(/\(a,b\)\s*=>\s*recordTimestamp\(([ab])\.(createdAt|at|receivedAt)\)\s*-\s*recordTimestamp\(([ab])\.\2\)/g)];
  assert.ok(comparators.length>=18,'Expected the affected timestamp lists');
  for(const match of comparators){
    const compare=vm.runInContext(match[0],c),key=match[2];
    const records=[{id:'old',[key]:'2026-09-27T00:00:00Z'},{id:'new',[key]:'2026-09-29T00:00:00Z'},{id:'middle',[key]:Date.parse('2026-09-28T00:00:00Z')}];
    assert.deepEqual(records.sort(compare).map(r=>r.id),match[1]==='b'?['new','middle','old']:['old','middle','new']);
  }
});
