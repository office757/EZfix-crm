import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const earnings=fs.readFileSync(new URL('../technician-earnings.js',import.meta.url),'utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return html.slice(a,b);}
const payroll=section('let payrollRange =','window.exportPayrollCSV = exportPayrollCSV;');
function runtime(){
  const c={IS_OWNER:false,CURRENT_TEAM_MEMBER:{id:'one',name:'Alex',role:'technician',status:'active'},VIEW_AS:'',window:{},
    STORE:{team:[{id:'one',name:'Alex',role:'Technician',status:'Active',commissionPercent:30},{id:'two',name:'Alex',role:'Technician',status:'Active',commissionPercent:40}],jobs:[{id:'j1',technicianId:'one',technician:'Old name',scheduledDate:'2026-09-29',status:'completed',customerName:'Own customer',materialCost:200,partsPaidBy:'technician'},{id:'j2',technicianId:'two',technician:'Alex',scheduledDate:'2026-09-29',status:'scheduled',customerName:'Other customer',materialCost:100}],invoices:[{id:'i1',number:'INV1',jobId:'j1',items:[{qty:1,rate:1000,taxable:true}],taxRate:6.25,payments:[{amount:103.5,appliedAmount:100}]},{id:'i2',jobId:'j2',items:[{qty:1,rate:7000}]}],leads:[]},
    esc:v=>String(v??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k])),money:v=>Number(v).toFixed(2),fmtDate:String,labelize:String,emptyState:(_,title,body)=>`${title}: ${body}`,render(){},renderPreserveScroll(){},todayISO:()=>'2026-09-29',dashboardModuleCategories:()=>[],canOperateOffice:()=>false};
  c.isTechnicianView=()=>c.CURRENT_TEAM_MEMBER?.role==='technician'||c.IS_OWNER&&!!c.VIEW_AS;
  vm.createContext(c);
  vm.runInContext(section('function technicianAllowedPage(','function isMarketingManager(')+section('function computeTotals(','function estimateTotal(')+section('function invoiceTotal(','function ccSurchargeAmount(')+payroll+earnings+section('function renderTechnicianDashboard(','function dashboardModuleCategories('),c);
  vm.runInContext("earningsRange={from:'2026-09-01',to:'2026-09-30'};payrollRange={from:'2026-09-01',to:'2026-09-30'}",c);
  return c;
}
test('personal earnings uses the signed-in ID and the saved payroll formula',()=>{
  const c=runtime(),d=c.personalEarningsData();assert.equal(d.jobs.length,1);assert.equal(d.rows[0].job.id,'j1');
  assert.equal(d.totalRevenue,1000);assert.equal(d.commission,240);assert.equal(d.totalReimbursement,200);assert.equal(d.payout,440);
  assert.equal(d.rows[0].invoiceGrandTotal,1062.5);assert.equal(d.rows[0].collected,100);assert.equal(d.rows[0].balance,962.5);
});
test('personal renderer never shows other technicians or commission controls',()=>{
  const c=runtime(),content={},actions={innerHTML:'stale'};c.renderTechnicianEarnings(content,actions);
  assert.match(content.innerHTML,/Own customer/);assert.ok(!content.innerHTML.includes('Other customer'));assert.ok(!content.innerHTML.includes('7000.00'));
  assert.ok(!/setPayrollCommission|exportPayrollCSV|type="number"/.test(content.innerHTML));assert.equal(actions.innerHTML,'');
  assert.match(content.innerHTML,/does not record payroll payments/);
});
test('office report overrides do not affect technician earnings',()=>{
  const c=runtime();c.setPayrollCommission('id:one',90);assert.equal(c.personalEarningsData().commissionPct,30);assert.equal(c.personalEarningsData().payout,440);
});
test('legacy name-only records and another technician with the same name never leak',()=>{
  const c=runtime();c.STORE.jobs.push({id:'legacy',technician:'Alex',scheduledDate:'2026-09-29'});assert.deepEqual(Array.from(c.personalEarningsData().jobs,j=>j.id),['j1']);
});
test('missing, inactive, office, owner and marketing identities do not get a personal report',()=>{
  for(const identity of [null,{id:'one',role:'technician',status:'inactive'},{id:'one',role:'office',status:'active'},{id:'one',role:'owner',status:'active'},{id:'one',role:'marketing_manager',status:'active'}]){
    const c=runtime();c.CURRENT_TEAM_MEMBER=identity;assert.equal(c.personalEarningsData(),null);
    const content={};c.renderTechnicianEarnings(content,{});assert.match(content.innerHTML,/Technician access required/);
  }
});
test('missing or inactive roster membership fails closed',()=>{
  const c=runtime();c.STORE.team[0].status='Inactive';assert.equal(c.personalEarningsData(),null);
  c.STORE.team=[];assert.equal(c.personalEarningsData(),null);
});
test('owner preview requires a unique active technician, without fallback to the owner',()=>{
  const c=runtime();c.IS_OWNER=true;c.CURRENT_TEAM_MEMBER={id:'owner',role:'owner',status:'active'};c.VIEW_AS='Alex';assert.equal(c.personalEarningsData(),null);
  c.STORE.team[1].name='Other';assert.equal(c.personalEarningsData().memberId,'one');
  c.VIEW_AS='Missing';assert.equal(c.personalEarningsData(),null);
});
test('date bounds and deleted records match office payroll for the same assigned ID',()=>{
  const c=runtime();c.STORE.jobs.push({id:'old',technicianId:'one',scheduledDate:'2026-08-31'},{id:'deleted',technicianId:'one',scheduledDate:'2026-09-20',deletedAt:1});
  c.STORE.invoices.push({id:'deletedInvoice',jobId:'j1',items:[{qty:1,rate:999}],deletedAt:1},{id:'extra',jobId:'j1',items:[{qty:1,rate:500,taxable:false}]});
  const own=c.personalEarningsData(),office=c.payrollReportCards().find(d=>d.memberId==='one');
  assert.equal(own.jobs.length,1);assert.equal(own.totalRevenue,1500);assert.equal(own.payout,office.payout);assert.equal(own.payout,590);
});
test('zero commission is respected and missing commission is visibly unconfigured',()=>{
  const c=runtime(),content={};c.STORE.team[0].commissionPercent=0;assert.equal(c.personalEarningsData().payout,200);assert.equal(c.personalEarningsData().rateConfigured,true);
  c.STORE.team[0].commissionPercent=null;c.renderTechnicianEarnings(content,{});assert.match(content.innerHTML,/has not been configured/);assert.match(content.innerHTML,/Not set/);
});
test('unscheduled jobs and incomplete invoices are explicitly identified',()=>{
  const c=runtime(),content={};c.STORE.jobs.push({id:'unscheduled',technicianId:'one'});c.STORE.invoices=[];c.STORE.jobs[0].status='in_progress';
  c.renderTechnicianEarnings(content,{});assert.match(content.innerHTML,/1 unscheduled job/);assert.match(content.innerHTML,/No linked invoice yet/);assert.match(content.innerHTML,/not completed/);
});
test('invalid date ranges do not display misleading totals',()=>{
  const c=runtime(),content={};c.setEarningsDate('from','2026-10-01');c.renderTechnicianEarnings(content,{});assert.match(content.innerHTML,/end on or after/);assert.ok(!content.innerHTML.includes('440.00'));
});
test('names, descriptions and job links are escaped',()=>{
  const c=runtime(),content={};c.STORE.jobs[0].customerName='<script>unsafe</script>';c.STORE.jobs[0].description='<img onerror=alert(1)>';c.renderTechnicianEarnings(content,{});
  assert.ok(!content.innerHTML.includes('<script>'));assert.match(content.innerHTML,/&lt;script&gt;/);assert.match(content.innerHTML,/&lt;img/);
  assert.match(content.innerHTML,/go\('jobs',this.dataset.job\)/);
});
test('technician dashboard resolves actual login despite empty VIEW_AS and renamed labels',()=>{
  const c=runtime(),content={};c.renderTechnicianDashboard(content,{});assert.match(content.innerHTML,/Your jobs today<\/div><div class="value">1/);
  c.STORE.jobs[0].status='scheduled';c.renderTechnicianDashboard(content,{});assert.match(content.innerHTML,/Own customer/);assert.ok(!content.innerHTML.includes('Other customer'));
});
test('day calendar uses the logged-in technician ID and ignores another saved technician filter',()=>{
  const c=runtime(),content={};Object.assign(c,{searchTerms:{calendarSelectedDate:'2026-09-29',calendarTech:'two'},calendarTechFilterOptions:()=>[],getOne:()=>null,jobStatusAccent:()=>'',addDays:(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}});
  vm.runInContext(section('function jobMatchesTechFilter(','function renderCalendarMonth(')+section('function renderCalendarDay(','function openJobModalForDate('),c);
  c.renderCalendarDay(content);assert.match(content.innerHTML,/Own customer/);assert.ok(!content.innerHTML.includes('Other customer'));assert.match(content.innerHTML,/1 scheduled job/);
});
test('assigned leads use saved identity while same-name and unassigned leads stay hidden',()=>{
  const c=runtime();assert.equal(c.technicianOwnsLead({assignedTechnicianId:'one',assignedTechnician:'Old name'}),true);
  for(const lead of [{assignedTechnicianId:'two',assignedTechnician:'Alex'},{assignedTechnician:'Alex'},{assignedTechnicianId:'one',deletedAt:1}])assert.equal(c.technicianOwnsLead(lead),false);
});
test('no technician workspace list still relies on the owner preview name',()=>{
  assert.ok(!/j\.technician===VIEW_AS|l\.assignedTechnician===VIEW_AS/.test(html));
});
test('personal route is allowed while team and owner payroll stay blocked',()=>{
  const c=runtime();assert.equal(c.technicianAllowedPage('earnings'),true);assert.equal(c.technicianAllowedPage('payroll'),false);assert.equal(c.technicianAllowedPage('team'),false);
});
test('personal payroll script and route are connected in the production page',()=>{
  assert.match(html,/<script src="\/technician-earnings.js"><\/script>/);assert.match(html,/route.page === 'earnings'\) return renderTechnicianEarnings/);
});
