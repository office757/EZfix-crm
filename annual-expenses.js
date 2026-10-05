/* Owner annual expense summary. Customer payment receipts remain separate. */
(function(){
'use strict';
const state={year:String(new Date().getFullYear()),busy:false,result:null,error:'',calculatedAt:''};
const allowed=()=>IS_OWNER&&!isTechnicianView();
const utils=window.AnnualExpenseUtils;
const previous=renderExpenses;
renderExpenses=function(content,actions){
 previous(content,actions);if(!allowed())return;
 const years=[...new Set([state.year,String(new Date().getFullYear()),String(new Date().getFullYear()-1),...(STORE.expenses||[]).filter(e=>utils.validDate(e.date)).map(e=>e.date.slice(0,4))])].sort().reverse();
 const result=state.result,section=document.createElement('section');section.className='panel';
 section.innerHTML=`<div class="panel-head"><h3>Annual expense summary</h3></div><div class="panel-body pad"><p class="muted">Calculate recorded business expenses by category for your accountant. Totals reflect supplier receipts, not customer payments. Tax deductibility and tax owed are determined separately.</p><div class="receipt-archive-controls"><label class="field"><span class="lbl">Expense year</span><select aria-label="Expense year" onchange="AnnualExpenses.setYear(this.value)" ${state.busy?'disabled':''}>${years.map(y=>`<option value="${y}" ${y===state.year?'selected':''}>${y}</option>`).join('')}</select></label><button class="btn btn-primary" onclick="AnnualExpenses.calculate()" ${state.busy?'disabled':''}>${state.busy?'Calculating…':'Calculate'}</button>${result&&!state.busy&&!state.error?'<button class="btn" onclick="AnnualExpenses.exportCsv()">Download accountant CSV</button>':''}</div><div role="status" aria-live="polite">${state.error?`<p role="alert">${esc(state.error)}</p>`:''}${result&&!state.error&&!state.busy?`<div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))"><div class="stat-card accent"><div class="label">${result.year} total expenses</div><div class="value">${money(result.totalCents/100)}</div></div><div class="stat-card"><div class="label">Expense receipts</div><div class="value">${result.count}</div></div></div><p class="muted">Calculated ${esc(state.calculatedAt)}. Click Calculate again after adding or editing receipts.</p>${result.invalid.length||result.undated.length?`<p role="alert">Excluded: ${result.invalid.length} receipts in this year with invalid amounts; ${result.undated.length} receipts without a valid date. Review these receipts before using the summary.</p>`:''}${result.missingPhotos?`<p class="muted">${result.missingPhotos} included receipts have no photo attached.</p>`:''}<div class="workspace-table-scroll"><table class="list"><thead><tr><th>Category</th><th>Receipts</th><th>Total spent</th></tr></thead><tbody>${result.groups.map(g=>`<tr><td>${esc(g.category)}</td><td>${g.count}</td><td>${money(g.cents/100)}</td></tr>`).join('')}</tbody><tfoot><tr><th>Total</th><th>${result.count}</th><th>${money(result.totalCents/100)}</th></tr></tfoot></table></div>${!result.count?'<p>No expense receipts recorded for this year.</p>':''}`:(!state.busy&&!state.error?'<p class="muted">Choose a year and click Calculate to see your expense breakdown.</p>':'')}</div></div>`;
 content.prepend(section);
};
window.AnnualExpenses={
 setYear(value){if(!allowed()||state.busy||!/^\d{4}$/.test(String(value)))return;state.year=String(value);state.result=null;state.error='';renderPreserveScroll();},
 async calculate(){
  if(!allowed()||state.busy)return;state.busy=true;state.result=null;state.error='';renderPreserveScroll();
  try{
   await refreshCollection('expenses');
   if(!allowed())return;
   state.result=utils.summarize(STORE.expenses,state.year);state.calculatedAt=new Date().toLocaleString();
  }catch(e){state.error=e?.message||'Could not load all expense receipts. Please retry.';}
  finally{state.busy=false;if(route.page==='expenses')renderPreserveScroll();}
 },
 exportCsv(){
  if(!allowed()||state.busy||state.error||!state.result)return;
  const r=state.result,rows=[['Expense summary year',r.year],['Calculated at',state.calculatedAt],['Recorded expenses only; tax deductibility and tax owed determined separately'],['Excluded invalid amounts',r.invalid.length],['Unassigned invalid dates',r.undated.length],[],['Category','Receipt count','Amount USD'],...r.groups.map(g=>[g.category,g.count,(g.cents/100).toFixed(2)]),['Total',r.count,(r.totalCents/100).toFixed(2)],[],['Receipt ID','Date','Vendor','Category','Amount USD','Notes','Receipt photo'],...r.rows.map(e=>[e.id,e.date,e.vendor||e.description||'',e.category,(e.cents/100).toFixed(2),e.notes||'',e.photoAssetId||''])];
  const blob=new Blob([window.ReceiptArchiveUtils.csv(rows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Business-expenses-'+r.year+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
};
})();
