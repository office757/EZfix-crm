/* Calendar-year expense totals use receipt dates and integer cents. */
(function(root){
'use strict';
const categories=['Parts & materials','Equipment','Fuel/vehicle','Supplies','Insurance','Rent','Utilities','Marketing','Software & subscriptions','Payroll','Professional services','Bank & processing fees','Other'];
function cents(value){
 const s=String(value??'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
 const [whole,fraction='']=s.split('.');
 const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return Number.isSafeInteger(n)?n:null;
}
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function summarize(receipts,year){
 const y=String(year);if(!/^\d{4}$/.test(y))throw new Error('Choose a valid year.');
 const groups=new Map(categories.map(category=>[category,{category,count:0,cents:0}]));
 const rows=[],invalid=[],undated=[];let totalCents=0,missingPhotos=0;
 for(const receipt of receipts||[]){
  if(receipt.deletedAt)continue;
  if(!validDate(receipt.date)){undated.push(receipt);continue;}
  if(receipt.date.slice(0,4)!==y)continue;
  const amount=cents(receipt.amount);
  if(amount===null){invalid.push(receipt);continue;}
  const next=totalCents+amount;if(!Number.isSafeInteger(next))throw new Error('Expense total is too large to calculate accurately.');
  const category=String(receipt.category||'Other').trim()||'Other';
  if(!groups.has(category))groups.set(category,{category,count:0,cents:0});
  const group=groups.get(category);group.count++;group.cents+=amount;totalCents=next;
  if(!receipt.photoAssetId&&!receipt.photoUrl)missingPhotos++;
  rows.push({...receipt,category,cents:amount});
 }
 return {year:y,totalCents,count:rows.length,missingPhotos,invalid,undated,rows,groups:[...groups.values()]};
}
const api={categories,cents,validDate,summarize};
if(typeof module==='object'&&module.exports)module.exports=api;else root.AnnualExpenseUtils=api;
})(typeof window==='object'?window:globalThis);
