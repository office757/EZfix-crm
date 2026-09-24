import fs from 'node:fs';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const checks = [
  ['job modal exposes parts payer', source.includes('id="f_partspaidby"')],
  ['company parts option exists', source.includes('>Company Parts</option>')],
  ['technician parts option exists', source.includes('>Technician Parts</option>')],
  ['parts payer persists on job', source.includes("partsPaidBy: document.getElementById('f_partspaidby').value || 'company'")],
  ['legacy jobs default to company parts', source.includes("const partsPaidBy = j.partsPaidBy === 'technician' ? 'technician' : 'company';")],
  ['technician-paid parts reimburse exactly material cost', source.includes("const reimbursement = partsPaidBy === 'technician' ? materialCost : 0;")],
  ['commission remains based on profit after parts', source.includes("const commission = jobProfit * (commissionPct/100);")],
  ['payout adds reimbursement after commission', source.includes("const payout = commission + totalReimbursement;")],
  ['payroll displays reimbursement', source.includes('Technician parts reimbursement')],
  ['job detail labels parts payer', source.includes("j.partsPaidBy==='technician'?'Technician Parts':'Company Parts'")],
];

let passed=0;
for(const [name,ok] of checks){
  console.log(`${ok?'PASS':'FAIL'} ${name}`);
  if(ok) passed++;
}
console.log(`${passed}/${checks.length} assertions passed`);
if(passed!==checks.length) process.exit(1);
