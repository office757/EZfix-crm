
export function totals(doc) {
 const items=Array.isArray(doc.items)?doc.items:[];
 const subtotal=items.reduce((s,x)=>s+Number(x.qty)*Number(x.rate),0);
 const taxable=items.reduce((s,x)=>s+(x.taxable!==false?Number(x.qty)*Number(x.rate):0),0);
 const discount=Math.min(Number(doc.discount)||0,subtotal);
 const tax=Math.round(taxable*(subtotal>0?(subtotal-discount)/subtotal:1)*(Number(doc.tax_rate)||0))/100;
 const total=Math.round((subtotal-discount+tax)*100)/100;
 const payments=Array.isArray(doc.payments)?doc.payments:[];
 const paid=payments.reduce((s,p)=>s+Number(p.appliedAmount??p.amount??0),0);
 const fees=payments.reduce((s,p)=>s+Number(p.cardFee??0),0);
 if(![subtotal,tax,total,paid,fees].every(Number.isFinite))throw new Error('Invalid invoice amounts');
 return {subtotal,discount,tax,total,paid,fees,balance:Math.max(0,Math.round((total-paid)*100)/100)};
}
export const isPaid=doc=>{const t=totals(doc);return !doc.deleted_at&&t.total>0&&t.balance===0;};
