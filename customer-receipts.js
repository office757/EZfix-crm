
/* Customer receipt PDFs are created server-side, including when the CRM is closed. */
(function(){
 const pending=new Map();
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
  const paymentDate=doc=>doc.payments?.at(-1)?.date||doc.payments?.at(-1)?.at||doc.date||doc.createdAt;
  const docs=(STORE.invoices||[]).filter(paid).sort((a,b)=>recordTimestamp(paymentDate(b))-recordTimestamp(paymentDate(a)));
  const section=document.createElement('div');section.className='panel';
  section.innerHTML='<div class="panel-body"><h3>Customer receipts</h3>'+(docs.length?
   '<table class="list"><thead><tr><th>Receipt</th><th>Customer</th><th>Date</th><th>Paid</th><th>PDF</th></tr></thead><tbody>'+docs.map(doc=>{
    const arg=esc(JSON.stringify(doc.id));
    return '<tr><td><button class="btn btn-sm" onclick="go(\'invoices\','+arg+')">'+esc(doc.number||doc.id)+'</button></td><td>'+esc(doc.customerName||getOne('customers',doc.customerId)?.name||'—')+'</td><td>'+esc(fmtDate(paymentDate(doc)))+'</td><td>'+money(paidTotal(doc)+(doc.payments||[]).reduce((s,p)=>s+paymentCardFee(p),0))+'</td><td><button class="btn btn-sm" onclick="downloadCustomerReceipt('+arg+')">'+(doc.customerReceiptPdf?'Download PDF':'Preparing PDF')+'</button></td></tr>';
   }).join('')+'</tbody></table>':emptyState('🧾','No customer receipts yet','Paid invoices appear here automatically.'))+'</div>';
  content.prepend(section);sync();
 };
 const previousRefresh=refreshCollection;
 refreshCollection=async function(col){const result=await previousRefresh(col);if(col==='invoices')queueMicrotask(sync);return result;};
 const previousReplace=replaceStoreRecord;
 replaceStoreRecord=function(col,row){const result=previousReplace(col,row);if(col==='invoices')queueMicrotask(sync);return result;};
 window.CustomerReceipts={sync,ensure};setInterval(sync,30000);sync();
})();
