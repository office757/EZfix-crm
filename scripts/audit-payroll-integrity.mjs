import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const totals=html.slice(html.indexOf('function computeTotals('),html.indexOf('function estimateTotal('));
const payroll=html.slice(html.indexOf('let payrollRange ='),html.indexOf('window.exportPayrollCSV = exportPayrollCSV;'));
const member=(id,name,commissionPercent=30)=>({id,name,commissionPercent,role:'Technician'});
const job=(id,technicianId,technician,extra={})=>({id,technicianId,technician,scheduledDate:'2026-09-29',materialCost:200,partsPaidBy:'technician',...extra});
const invoice=(id,jobId,rate=1000,extra={})=>({id,jobId,number:id,items:[{qty:1,rate,taxable:false}],...extra});
function runtime(team=[member('one','New name')],jobs=[job('job','one','Old name')],invoices=[invoice('INV1','job')]) {
  const c={STORE:{team,jobs,invoices},window:{},money:v=>Number(v).toFixed(2),paymentAppliedAmount:p=>Number(p.appliedAmount??p.amount??0),canOperateOffice:()=>true,render(){},renderPreserveScroll(){},emptyState:()=>'',esc:v=>String(v??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k])),fmtDate:String,exportCSV:(filename,columns,rows)=>{c.exported={filename,columns,rows};}};
  vm.createContext(c);vm.runInContext(totals+payroll+"\npayrollRange={from:'2026-09-01',to:'2026-09-30'};",c);
  return c;
}
test('renaming a technician counts the job and parts reimbursement once',()=>{
  const c=runtime(),cards=c.payrollReportCards();
  assert.equal(cards.length,1);assert.equal(cards[0].name,'New name');
  assert.equal(cards[0].jobs.length,1);assert.equal(cards[0].totalRevenue,1000);
  assert.equal(cards[0].totalReimbursement,200);assert.equal(cards[0].payout,440);
});
test('same-name technicians retain separate jobs, rates and overrides',()=>{
  const c=runtime([member('one','Alex',30),member('two','Alex',40)],[job('a','one','Alex'),job('b','two','Alex')],[invoice('I1','a'),invoice('I2','b',1500)]);
  let cards=c.payrollReportCards();assert.equal(cards.length,2);
  assert.equal(cards[0].totalRevenue,1000);assert.equal(cards[1].totalRevenue,1500);
  c.setPayrollCommission('id:one','35');cards=c.payrollReportCards();
  assert.equal(cards[0].commissionPct,35);assert.equal(cards[1].commissionPct,40);
  assert.equal(cards[0].payout,480);assert.equal(cards[1].payout,720);
});
test('legacy name-only job joins a unique team member',()=>{
  const c=runtime([member('one','Alex')],[job('a',null,'Alex')],[invoice('I1','a')]);
  const cards=c.payrollReportCards();assert.equal(cards.length,1);assert.equal(cards[0].payout,440);
});
test('ambiguous legacy name is retained once for review, never guessed',()=>{
  const c=runtime([member('one','Alex'),member('two','Alex')],[job('a',null,'Alex')],[invoice('I1','a')]);
  const cards=c.payrollReportCards();assert.equal(cards.reduce((n,t)=>n+t.jobs.length,0),1);
  const legacy=cards.find(t=>t.unlinked);assert.equal(legacy.totalRevenue,1000);assert.equal(legacy.commissionPct,0);
  assert.match(c.renderPayrollTechCardHtml(legacy),/review technician identity/);
});
test('missing roster member keeps historical jobs grouped by their saved ID',()=>{
  const c=runtime([], [job('a','archived','Old name'),job('b','archived','Older name')],[invoice('I1','a'),invoice('I2','b')]);
  const cards=c.payrollReportCards();assert.equal(cards.length,1);assert.equal(cards[0].memberId,'archived');assert.equal(cards[0].jobs.length,2);
});
test('saved technician ID works with a blank historical name',()=>{
  const c=runtime([member('one','Alex')],[job('a','one','')],[invoice('I1','a')]);
  assert.equal(c.payrollReportCards()[0].totalRevenue,1000);
});
test('all linked invoices count; sales tax and card fees stay outside commission',()=>{
  const c=runtime(undefined,undefined,[invoice('I1','job',1000,{discount:100,taxRate:6.25,items:[{qty:1,rate:1000,taxable:true}],payments:[{method:'Card',amount:103.5,appliedAmount:100,cardFee:3.5}]}),invoice('I2','job',500)]);
  const card=c.payrollReportCards()[0];assert.equal(card.totalRevenue,1400);assert.equal(card.commission,360);assert.equal(card.payout,560);
  assert.equal(card.rows[0].invoiceGrandTotal,1456.25);assert.equal(card.rows[0].invNumber,'I1, I2');assert.equal(card.rows[0].paymentMethods,'Card: 100.00');
});
test('company-paid parts reduce profit without technician reimbursement',()=>{
  const c=runtime(undefined,[job('job','one','Old name',{partsPaidBy:'company'})]);
  const card=c.payrollReportCards()[0];assert.equal(card.totalReimbursement,0);assert.equal(card.payout,240);
});
test('deleted jobs and invoices do not affect payroll',()=>{
  const c=runtime(undefined,[job('job','one','Old name'),job('deleted','one','New name',{deletedAt:1})],[invoice('I1','job'),invoice('deleted','job',500,{deletedAt:1}),invoice('I3','deleted')]);
  const card=c.payrollReportCards()[0];assert.equal(card.jobs.length,1);assert.equal(card.totalRevenue,1000);
});
test('date range includes boundaries and excludes unscheduled/out-of-range jobs',()=>{
  const c=runtime(undefined,[job('first','one','New name',{scheduledDate:'2026-09-01'}),job('last','one','New name',{scheduledDate:'2026-09-30'}),job('next','one','New name',{scheduledDate:'2026-10-01'}),job('unscheduled','one','New name',{scheduledDate:null})],[]);
  assert.deepEqual(Array.from(c.payrollReportCards()[0].jobs,j=>j.id),['first','last']);
});
test('zero commission stays zero and invalid report overrides are rejected',()=>{
  const c=runtime([member('one','New name',0)]);c.setPayrollCommission('id:one','101');c.setPayrollCommission('id:one','-1');c.setPayrollCommission('id:one','invalid');
  assert.equal(c.payrollReportCards()[0].commission,0);assert.equal(c.payrollReportCards()[0].payout,200);
});
test('CSV reuses the displayed ID-based calculation and includes payout details',()=>{
  const c=runtime(undefined,undefined,[invoice('I1','job'),invoice('I2','job',500)]);
  c.setPayrollCommission('id:one','35');const card=c.payrollReportCards()[0];c.exportPayrollCSV();
  assert.equal(c.exported.rows.length,1);const row=c.exported.rows[0];
  assert.equal(row.technician,'New name');assert.equal(row.technicianId,'one');assert.equal(row.invoiceNumbers,'I1, I2');
  assert.equal(row.revenuePreTax,card.totalRevenue.toFixed(2));assert.equal(row.commission,card.commission.toFixed(2));assert.equal(row.reimbursement,card.totalReimbursement.toFixed(2));assert.equal(row.payout,card.payout.toFixed(2));
  assert.equal(row.commission,'455.00');assert.equal(row.payout,'655.00');
});
test('technician cannot export the office payroll report',()=>{
  const c=runtime();c.canOperateOffice=()=>false;c.exportPayrollCSV();assert.equal(c.exported,undefined);
});
test('apostrophes in technician names cannot break the commission input',()=>{
  const c=runtime([member('one',"O'Brien")],[job('job','one',"O'Brien")]);
  const rendered=c.renderPayrollTechCardHtml(c.payrollReportCards()[0]);
  assert.match(rendered,/O&#39;Brien/);assert.match(rendered,/data-payroll-key="id:one"/);
  const handler=rendered.match(/oninput="([^"]+)"/)[1];
  vm.runInContext(`(function(){${handler}}).call({dataset:{payrollKey:'id:one'},value:'40'})`,c);
  assert.equal(c.payrollReportCards()[0].commissionPct,40);
});
test('payroll presets use local dates at midnight and month boundaries',()=>{
  const cases=[['America/New_York','2026-09-30T01:30:00Z','2026-09-29','2026-09-27','2026-09-01','2026-08-01','2026-08-31'],['Asia/Tokyo','2026-09-30T16:30:00Z','2026-10-01','2026-09-27','2026-10-01','2026-09-01','2026-09-30']];
  for(const [zone,now,today,week,month,previousStart,previousEnd] of cases){
    const code=`import vm from 'node:vm';import assert from 'node:assert/strict';const Base=Date;const c={Date:class extends Base{constructor(...args){super(...(args.length?args:[${JSON.stringify(now)}]));}},window:{},render(){}};vm.createContext(c);vm.runInContext(${JSON.stringify(payroll)},c);for(const [preset,from,to] of ${JSON.stringify([['week',week,today],['month',month,today],['lastmonth',previousStart,previousEnd]])}){c.setPayrollPreset(preset);assert.equal(vm.runInContext('payrollRange.from',c),from);assert.equal(vm.runInContext('payrollRange.to',c),to);}`;
    execFileSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TZ:zone},stdio:'pipe'});
  }
});
