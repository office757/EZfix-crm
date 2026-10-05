export const round = n => Math.round((Number(n)+Number.EPSILON)*100)/100;
const number = (n,label) => {const v=Number(n??0);if(!Number.isFinite(v)||Math.abs(v)>10000000)throw new Error('Invalid '+label);return v;};
export function validatePeriod(from,to){
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 if(!valid(from)||!valid(to)||from>=to||(Date.parse(to)-Date.parse(from))/86400000>366)throw new Error('Select a valid period of up to 366 days. The end date is excluded.');
}
export function invoiceFigures(i){
 const items=Array.isArray(i.items)?i.items:[];
 const subtotal=items.reduce((s,x)=>s+number(x.qty,'quantity')*number(x.rate,'rate'),0);
 if(subtotal<0||items.some(x=>number(x.qty,'quantity')<0||number(x.rate,'rate')<0))throw new Error('Negative invoice lines require review before payroll.');
 const discount=Math.min(Math.max(0,number(i.discount,'discount')),subtotal),revenue=round(subtotal-discount);
 const taxable=items.reduce((s,x)=>s+(x.taxable===false?0:number(x.qty,'quantity')*number(x.rate,'rate')),0)*(subtotal?revenue/subtotal:1);
 const taxRate=number(i.tax_rate??i.taxRate,'tax rate');if(taxRate<0||taxRate>100)throw new Error('Invalid tax rate');
 const total=round(revenue+round(taxable*taxRate/100));
 const payments=(Array.isArray(i.payments)?i.payments:[]).filter(p=>!['failed','canceled','cancelled','pending','declined','voided'].includes(String(p.status||'').toLowerCase()));
 const principal=p=>number(p.appliedAmount??p.applied_amount??p.amount,'payment');
 const paid=round(payments.reduce((s,p)=>s+principal(p),0));
 return {revenue,total,paid,payments:payments.map(p=>({method:String(p.method||'Other'),amount:round(principal(p))}))};
}
export function buildPayStatement({technician,jobs,invoices,claimed=[],from,to,rate,cashRetained=0}){
 validatePeriod(from,to);rate=number(rate??technician.commission_percent,'commission');if(rate<0||rate>100)throw new Error('Commission must be between 0 and 100.');
 const eligible=jobs.filter(j=>!j.deleted_at&&j.technician_id===technician.id&&j.scheduled_date>=from&&j.scheduled_date<to);
 const taken=new Set(claimed),rows=[],excluded=[];const methods={};
 for(const j of eligible){
  let reason='';const linked=invoices.filter(i=>!i.deleted_at&&i.job_id===j.id);const figures=linked.map(invoiceFigures);
  if(taken.has(j.id))reason='Already included in a saved pay statement';
  else if(j.status!=='completed')reason='Job is not completed';
  else if(!linked.length||figures.some(f=>f.total<=0||f.paid+.005<f.total))reason='Invoice is missing or not fully paid';
  if(reason){excluded.push({jobId:j.id,title:j.title,customer:j.customer_name,reason});continue;}
  const revenue=round(figures.reduce((s,f)=>s+f.revenue,0)),parts=number(j.material_cost,'parts cost');if(parts<0)throw new Error('Negative parts cost requires review.');
  const partsPaidBy=(j.app_data?.partsPaidBy||j.parts_paid_by)==='technician'?'technician':'company';
  const profit=round(revenue-parts),commission=round(profit*rate/100),reimbursement=partsPaidBy==='technician'?round(parts):0;
  const collected=figures.flatMap(f=>f.payments);
  for(const p of collected){const method=/cash/i.test(p.method)?'Cash':/card|credit|square/i.test(p.method)?'Card':/zelle/i.test(p.method)?'Zelle':/check/i.test(p.method)?'Check':'Other';methods[method]=round((methods[method]||0)+p.amount);}
  rows.push({jobId:j.id,date:j.scheduled_date,title:j.title||'Service',customer:j.customer_name||'Customer',invoices:linked.map(i=>i.number||i.id),revenue,parts:round(parts),partsPaidBy,profit,commission,reimbursement,entitlement:round(commission+reimbursement),collections:collected});
 }
 const sum=key=>round(rows.reduce((s,r)=>s+r[key],0));cashRetained=number(cashRetained,'retained cash');
 if(cashRetained<0||cashRetained>Math.max(0,methods.Cash||0)+.005)throw new Error('Confirmed retained cash cannot exceed actual cash collected on included jobs.');
 const entitlement=sum('entitlement');
 return {version:1,technicianId:technician.id,technician:technician.name,from,to,endExclusive:true,rate,rows,excluded,methods,revenue:sum('revenue'),parts:sum('parts'),commission:sum('commission'),reimbursement:sum('reimbursement'),entitlement,cashRetained:round(cashRetained),netDue:round(entitlement-cashRetained),basis:'Completed jobs with fully paid invoices; scheduled dates; pre-tax revenue less parts. End date excluded.'};
}
