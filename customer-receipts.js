
/* Customer receipt PDFs are created server-side, including when the CRM is closed. */
(function(){
 const pending=new Map();
 const archiveState={year:String(new Date().getFullYear()),search:'',exporting:false};
 const archive=()=>window.ReceiptArchiveUtils;
 const paid=doc=>invoiceTotal(doc)>0&&balanceDue(doc)<=0;
 const eligible=()=>CAN_EDIT&&!isTechnicianView()&&!isMarketingManager();
 async function ensure(id){
  if(!eligible())throw new Error('Receipt access requires office staff.');
  if(pending.has(id))return pending.get(id);
  const task=(async()=>{
   const {data,error}=await SB.functions.invoke('archive-customer-receipts',{body:{invoice_id:id}});
   if(error||!data?.ok)throw error||new Error('Receipt generation failed.');
   if(!data.asset)throw new Error('The receipt PDF is being prepared. Please try again shortly.');
   await refreshCollection('invoices');
   return data.asset;
  })();
  pending.set(id,task);task.finally(()=>pending.delete(id)).catch(()=>{});return task;
 }
 function sync(){
  if(!eligible())return;
  for(const doc of STORE.invoices||[]){
   if(paid(doc)&&!doc.customerReceiptPdf){
    ensure(doc.id).then(()=>{if(route.page==='expenses')renderPreserveScroll();}).catch(e=>console.error('Customer receipt archive',e));
   }
  }
 }
 window.downloadCustomerReceipt=async id=>{
  try{
   const receipt=await ensure(id);
   const {data,error}=await SB.storage.from(ASSET_BUCKET).download(receipt.path);
   if(error)throw error;
   const url=URL.createObjectURL(data),a=document.createElement('a');
   a.href=url;a.download=receipt.filename;document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){console.error(e);toast(e?.message||'Could not download the receipt PDF. Please try again.',true);}
 };
 const previousRender=renderExpenses;
 renderExpenses=function(content,actions){
  previousRender(content,actions);
  const paymentDate=doc=>archive()?.date(doc)||doc.payments?.at(-1)?.date||doc.date||doc.createdAt;
  const all=(STORE.invoices||[]).filter(doc=>!doc.deletedAt&&paid(doc)).sort((a,b)=>recordTimestamp(paymentDate(b))-recordTimestamp(paymentDate(a)));
  const years=[...new Set([String(new Date().getFullYear()),...all.map(doc=>String(paymentDate(doc)).slice(0,4)).filter(y=>/^\d{4}$/.test(y))])].sort().reverse();
  const docs=archive()?archive().filter(all,archiveState.year,archiveState.search):all;
  const section=document.createElement('div');section.className='panel';
  section.innerHTML='<div class="panel-head"><h3>Customer receipts</h3></div><div class="panel-body"><p class="muted">Final receipts are archived automatically when an invoice is fully paid. Closing a lead alone does not create a payment receipt.</p><div class="receipt-archive-controls"><label class="field"><span class="lbl">Year</span><select onchange="CustomerReceipts.setFilter(\'year\',this.value)"><option value="" '+(!archiveState.year?'selected':'')+'>All years</option>'+years.map(y=>'<option '+(archiveState.year===y?'selected':'')+'>'+y+'</option>').join('')+'</select></label><label class="field"><span class="lbl">Customer or invoice</span><input id="receiptArchiveSearch" value="'+esc(archiveState.search)+'" placeholder="Search receipts" onchange="CustomerReceipts.setFilter(\'search\',this.value)"></label><button class="btn" onclick="CustomerReceipts.exportCsv()">Download CSV</button><button class="btn btn-primary" onclick="CustomerReceipts.exportPdfs()" '+(archiveState.exporting?'disabled':'')+'>Download PDFs (ZIP)</button></div><p class="muted">'+docs.length+' receipts · '+money(docs.reduce((s,d)=>s+paidTotal(d)+(d.payments||[]).reduce((n,p)=>n+paymentCardFee(p),0),0))+' collected</p><p id="receiptArchiveProgress" role="status" aria-live="polite"></p>'+(docs.length?
   '<table class="list"><thead><tr><th>Receipt</th><th>Customer</th><th>Date</th><th>Paid</th><th>PDF</th></tr></thead><tbody>'+docs.map(doc=>{
    const arg=esc(JSON.stringify(doc.id));
    return '<tr><td><button class="btn btn-sm" onclick="go(\'invoices\','+arg+')">'+esc(doc.number||doc.id)+'</button></td><td>'+esc(doc.customerName||getOne('customers',doc.customerId)?.name||'—')+'</td><td>'+esc(fmtDate(paymentDate(doc)))+'</td><td>'+money(paidTotal(doc)+(doc.payments||[]).reduce((s,p)=>s+paymentCardFee(p),0))+'</td><td><button class="btn btn-sm" onclick="downloadCustomerReceipt('+arg+')">'+(doc.customerReceiptPdf?'Download PDF':'Preparing PDF')+'</button></td></tr>';
   }).join('')+'</tbody></table>':emptyState('🧾','No receipts match this view','Choose another year or clear the search. Fully paid invoices appear here automatically.'))+'</div>';
  content.prepend(section);sync();
 };
 const previousRefresh=refreshCollection;
 refreshCollection=async function(col){const result=await previousRefresh(col);if(col==='invoices')queueMicrotask(sync);return result;};
 const previousReplace=replaceStoreRecord;
 replaceStoreRecord=function(col,row){const result=previousReplace(col,row);if(col==='invoices')queueMicrotask(sync);return result;};
 function selectedDocs(){return archive().filter((STORE.invoices||[]).filter(d=>!d.deletedAt&&paid(d)),archiveState.year,archiveState.search);}
 function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function summary(docs){return archive().csv([['Invoice','Customer','Paid date','Invoice total','Applied payments','Card fees','Receipt PDF'],...docs.map(d=>[d.number,d.customerName||getOne('customers',d.customerId)?.name||'',archive().date(d),invoiceTotal(d).toFixed(2),paidTotal(d).toFixed(2),(d.payments||[]).reduce((s,p)=>s+paymentCardFee(p),0).toFixed(2),archive().filename(d)])]);}
 window.CustomerReceipts={sync,ensure,
  setFilter(key,value){if(!['year','search'].includes(key))return;archiveState[key]=String(value);renderPreserveScroll();},
  exportCsv(){if(!eligible()||!archive())return;save(new Blob([summary(selectedDocs())],{type:'text/csv;charset=utf-8'}),'Customer-receipts-'+(archiveState.year||'all-years')+'.csv');},
  async exportPdfs(){
   if(!eligible()||!archive()||archiveState.exporting)return;
   const docs=selectedDocs();if(!docs.length)return toast('No receipts in this view.',true);
   archiveState.exporting=true;const files=[];const period=archiveState.year||'all-years';
   try{
    for(const [i,doc] of docs.entries()){
     const status=document.getElementById('receiptArchiveProgress');if(status)status.textContent='Preparing receipt '+(i+1)+' of '+docs.length+'…';
     const asset=await ensure(doc.id),{data,error}=await SB.storage.from(ASSET_BUCKET).download(asset.path);if(error)throw error;
     const bytes=new Uint8Array(await data.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new Error('A receipt PDF could not be verified.');
     files.push({name:archive().filename(doc),data:bytes});
    }
    files.push({name:'receipts.csv',data:new TextEncoder().encode(summary(docs))});
    save(archive().zip(files),'Customer-receipts-'+period+'.zip');toast('Receipt archive downloaded');
   }catch(e){toast(e?.message||'Archive download failed. Please retry.',true);}
   finally{archiveState.exporting=false;const status=document.getElementById('receiptArchiveProgress');if(status)status.textContent='';}
  }
 };setInterval(sync,30000);sync();
})();
