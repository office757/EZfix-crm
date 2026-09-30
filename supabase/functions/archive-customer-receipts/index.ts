
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {PDFDocument,StandardFonts,rgb} from "npm:pdf-lib@1.17.1";
import {totals,isPaid} from "../_shared/customer-receipts.mjs";
import {renderReceiptPdf} from "../_shared/customer-receipt-pdf.mjs";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-ezfix-cron-token","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const response=(body:unknown,status=200)=>Response.json(body,{status,headers});
const terms="By approving this invoice, making a payment or deposit, or authorizing work to begin, the customer accepts the scope of work, pricing, payment terms, warranty terms, and conditions below.\nPayment & Deposits: Any required deposit must be paid before materials are ordered or installation is scheduled. Unless otherwise stated, the remaining balance is due upon completion of the contracted work.\nScope & Additional Work: Pricing covers only the services and materials listed on the approved estimate or invoice. Hidden damage, structural or electrical issues, improper previous installations, code requirements, or other unforeseen conditions are not included. Any additional chargeable work will require customer approval.\nSpecial Orders & Cancellations: Custom or special-order garage doors, colors, windows, hardware, openers, or other materials may become non-refundable once ordered, manufactured, shipped, or committed by a supplier. Customer-requested changes may result in additional charges or delays.\nRefund Policy: Except where required by law, completed labor, service calls, diagnostics, programming, repairs, installed/used materials, and completed installations are final and non-refundable. Approved cancellations or returns may be reduced by special-order costs, restocking fees, shipping, delivery, and other non-recoverable expenses.\nWarranty: Warranty coverage is limited to the warranty specifically stated on the estimate or invoice. Warranty does not cover normal wear, misuse, impact damage, unauthorized repairs or modifications, lack of maintenance, electrical/power issues, water damage, structural movement, pre-existing conditions, or damage outside EZfix's control. EZfix must be given a reasonable opportunity to inspect and correct a covered warranty issue before a refund or other remedy is considered.\nScheduling: Installation and service dates may be affected by product availability, supplier/manufacturer delays, weather, site conditions, or other circumstances outside EZfix's reasonable control.\nCustomer Responsibility: The customer must provide safe and reasonable access to the work area and confirms they have authority to approve work at the property.\nBy authorizing the work or making payment, the customer acknowledges and agrees to these terms.\nEZfix Garage Doors Inc | Massachusetts\nNothing in these terms waives any consumer cancellation, refund, warranty, or other rights that cannot legally be waived under applicable Massachusetts or federal law.";
const cash=(n:number)=>'$'+n.toFixed(2);
const safe=(v:any)=>String(v??'').replace(/[^\x20-\x7E\xA0-\xFF\n]/g,'?');

let logoCache:string|undefined;
async function logo(){
 if(logoCache)return logoCache;
 const res=await fetch('https://ezfix-crm-sms-length-fixed.vercel.app/assets/ezfix-invoice-logo.png',{signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw new Error('Receipt logo unavailable');
 const bytes=new Uint8Array(await res.arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
 logoCache='data:image/png;base64,'+btoa(binary);return logoCache;
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return response({ok:false,error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const secret=Deno.env.get('EZFIX_CALL_SYNC_CRON_TOKEN')||'';
  const cron=!!secret&&req.headers.get('x-ezfix-cron-token')===secret;
  if(!cron){
   const auth=req.headers.get('Authorization')||'';
   if(!auth.startsWith('Bearer '))return response({ok:false,error:'Unauthorized'},401);
   const scoped=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
   const {data:{user},error}=await scoped.auth.getUser();if(error||!user)return response({ok:false,error:'Unauthorized'},401);
   const {data:member}=await db.from('team').select('role,status').eq('auth_user_id',user.id).maybeSingle();
   if(!member||member.status!=='active'||!['owner','admin','dispatcher','office'].includes(member.role))return response({ok:false,error:'Forbidden'},403);
  }
  const body=await req.json().catch(()=>({}));
  const invoiceId=typeof body.invoice_id==='string'?body.invoice_id:null;
  if(!cron&&!invoiceId)return response({ok:false,error:'invoice_id required'},400);
  if(cron&&body.validate_only){
   const {data:rows,error:e}=await db.from('invoices').select('id,app_data').not('app_data->customer_receipt_pdf','is',null).is('deleted_at',null).limit(1);
   if(e)throw e;
   const sample=rows?.[0]?.app_data?.customer_receipt_pdf;
   if(!sample)return response({ok:true,sample:null});
   const {data:blob,error:de}=await db.storage.from('crm-assets').download(sample.path);if(de)throw de;
   const bytes=new Uint8Array(await blob.arrayBuffer()),parsed=await PDFDocument.load(bytes);
   const {data:link,error:le}=await db.storage.from('crm-assets').createSignedUrl(sample.path,120);if(le)throw le;
   return response({ok:true,bytes:bytes.length,pages:parsed.getPageCount(),sample_url:link.signedUrl});
  }
  const {data:jobs,error}=await db.rpc('claim_customer_receipts',{p_invoice_id:invoiceId});
  if(error)throw error;
  let processed=0,failed=0;
  for(const job of jobs||[]){
   let path='';
   try{
    const {data:inv,error:readError}=await db.from('invoices').select('*').eq('id',job.invoice_id).maybeSingle();
    if(readError)throw readError;
    if(!inv||!isPaid(inv)){
     const {error:e}=await db.rpc('finish_customer_receipt',{p_invoice_id:job.invoice_id,p_source_hash:job.source_hash,p_lease_token:job.lease_token,p_asset:null,p_skipped:true});if(e)throw e;continue;
    }
    let customer=null;
    if(inv.customer_id){const r=await db.from('customers').select('name,phone,email,address').eq('id',inv.customer_id).maybeSingle();if(r.error)throw r.error;customer=r.data;}
    const bytes=await renderReceiptPdf(inv,customer,await logo());
    path='receipts/customer/'+crypto.randomUUID()+'.pdf';
    const {error:uploadError}=await db.storage.from('crm-assets').upload(path,bytes,{contentType:'application/pdf',upsert:false});if(uploadError)throw uploadError;
    const asset={id:'crm-assets/'+path,path,sourceHash:job.source_hash,createdAt:new Date().toISOString(),filename:'Receipt-'+String(inv.number||inv.id).replace(/[^a-zA-Z0-9._-]/g,'_')+'.pdf'};
    const {data:done,error:finishError}=await db.rpc('finish_customer_receipt',{p_invoice_id:job.invoice_id,p_source_hash:job.source_hash,p_lease_token:job.lease_token,p_asset:asset,p_skipped:false});
    if(finishError)throw finishError;
    if(!done){await db.storage.from('crm-assets').remove([path]);continue;}
    processed++;
   }catch(e){
    if(path)await db.storage.from('crm-assets').remove([path]);
    const reason=String(e instanceof Error?e.message:'Receipt generation failed').slice(0,180);
    await db.from('customer_receipt_jobs').update({status:'pending',lease_until:new Date(Date.now()+60000).toISOString(),last_error:reason}).eq('invoice_id',job.invoice_id).eq('lease_token',job.lease_token);
    console.error('Customer receipt archive failed',job.invoice_id,reason);failed++;
   }
  }
  let asset=null;
  if(invoiceId){
   const {data:job}=await db.from('customer_receipt_jobs').select('source_hash,status').eq('invoice_id',invoiceId).maybeSingle();
   const {data:inv}=await db.from('invoices').select('app_data').eq('id',invoiceId).is('deleted_at',null).maybeSingle();
   const candidate=inv?.app_data?.customer_receipt_pdf;
   if(job?.status==='ready'&&candidate?.sourceHash===job.source_hash)asset=candidate;
  }
  return response({ok:failed===0,processed,failed,asset},failed?503:200);
 }catch(e){console.error(e);return response({ok:false,error:'Receipt archive unavailable'},500);}
});
