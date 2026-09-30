/* Customer receipts are indexed from paid invoices, independently of supplier expenses. */
(function(){
  const pending=new Map();
  const paid=doc=>invoiceTotal(doc)>0 && balanceDue(doc)<=0;
  const eligible=()=>CAN_EDIT && !isTechnicianView() && !isMarketingManager();
  const fingerprint=doc=>JSON.stringify([doc.number,doc.customerId,doc.customerName,doc.customerAddress,doc.items,doc.taxRate,doc.discount,doc.payments]);
  async function ensure(id){
    if(!eligible())throw new Error('Receipt archive access is restricted to office staff.');
    if(pending.has(id)) return pending.get(id);
    const task=queueMutation('record:invoices:'+id,async()=>{
      const {data:row,error}=await SB.from('invoices').select('*').eq('id',id).maybeSingle();
      if(error)throw error;
      if(!row||row.deleted_at)return null;
      const doc=fromDbRow(row);
      if(!paid(doc))return null;
      const version=fingerprint(doc);
      if(doc.customerReceiptPdf?.version===version)return doc.customerReceiptPdf;
      const pdf=await buildPdfDoc('invoice',doc);
      const asset=await uploadAsset(new File([pdf.output('blob')], 'Receipt-'+(doc.number||id)+'.pdf',{type:'application/pdf'}),'receipts');
      const receipt={...asset,version,createdAt:new Date().toISOString(),filename:'Receipt-'+(doc.number||id)+'.pdf'};
      const {data:updated,error:saveError}=await SB.from('invoices').update({app_data:{...(row.app_data||{}),customer_receipt_pdf:receipt}}).eq('id',id).eq('row_version',row.row_version).select('*').maybeSingle();
      if(saveError||!updated)throw saveError||new Error('Invoice changed while its receipt was being saved; retry.');
      replaceStoreRecord('invoices',updated);
      return receipt;
    });
    pending.set(id,task);
    task.finally(()=>pending.delete(id)).catch(()=>{});
    return task;
  }
  function sync(){
    if(!eligible()||!window.jspdf)return;
    for(const doc of STORE.invoices||[]){
      if(paid(doc)&&doc.customerReceiptPdf?.version!==fingerprint(doc)){
        ensure(doc.id).then(()=>{if(route.page==='expenses')renderPreserveScroll();}).catch(e=>console.error('Customer receipt archive',e));
      }
    }
  }
  window.downloadCustomerReceipt=async id=>{
    try{
      const receipt=await ensure(id);
      if(!receipt)return toast('This invoice is not fully paid.',true);
      const {data,error}=await SB.storage.from(ASSET_BUCKET).download(receipt.path);
      if(error)throw error;
      const url=URL.createObjectURL(data),a=document.createElement('a');
      a.href=url;a.download=receipt.filename;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){console.error(e);toast('Could not save or download the receipt PDF. Please try again.',true);}
  };
  const previousRender=renderExpenses;
  renderExpenses=function(content,actions){
    previousRender(content,actions);
    const docs=(STORE.invoices||[]).filter(paid).sort((a,b)=>recordTimestamp(b.payments?.at(-1)?.date||b.date)-recordTimestamp(a.payments?.at(-1)?.date||a.date));
    const section=document.createElement('div');section.className='panel';
    section.innerHTML='<div class="panel-body"><h3>Customer receipts</h3>'+ (docs.length?
      '<table class="list"><thead><tr><th>Receipt</th><th>Customer</th><th>Date</th><th>Paid</th><th>PDF</th></tr></thead><tbody>'+docs.map(doc=>{
        const arg=esc(JSON.stringify(doc.id));
        return '<tr><td><button class="btn btn-sm" onclick="go(\'invoices\','+arg+')">'+esc(doc.number||doc.id)+'</button></td><td>'+esc(doc.customerName||getOne('customers',doc.customerId)?.name||'—')+'</td><td>'+esc(fmtDate(doc.payments?.at(-1)?.date||doc.date))+'</td><td>'+money(invoiceTotal(doc))+'</td><td><button class="btn btn-sm" onclick="downloadCustomerReceipt('+arg+')">Download PDF</button></td></tr>';
      }).join('')+'</tbody></table>':emptyState('🧾','No customer receipts yet','Paid invoices appear here automatically.'))+'</div>';
    content.prepend(section);sync();
  };
  const previousRefresh=refreshCollection;
  refreshCollection=async function(col){const result=await previousRefresh(col);if(col==='invoices')queueMicrotask(sync);return result;};
  const previousReplace=replaceStoreRecord;
  replaceStoreRecord=function(col,row){const result=previousReplace(col,row);if(col==='invoices')queueMicrotask(sync);return result;};
  window.CustomerReceipts={sync,ensure};
  setInterval(sync,30000);
  sync();
})();
