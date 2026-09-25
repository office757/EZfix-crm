import { createClient } from "npm:@supabase/supabase-js@2";
import { Webhook } from "npm:svix@1.76.1";

const url=Deno.env.get("SUPABASE_URL")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
let cachedSigningSecret="",cachedSecretAt=0;
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,svix-id,svix-timestamp,svix-signature","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(body:unknown,status=200)=>Response.json(body,{status,headers:{...cors,"Content-Type":"application/json"}});
const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const applied=(p:any)=>{const n=Number(p?.appliedAmount ?? p?.amount ?? 0);return Number.isFinite(n)?Math.max(0,n):0;};
const deliveryRank:Record<string,number>={"":0,pending_manual_send:0,ready:0,event:0,accepted:1,sent:2,delayed:3,delivered:4,failed:5};
const laterStatus=(current:string,incoming:string)=>(deliveryRank[incoming]||0)>=(deliveryRank[current]||0)?incoming:current;
function invoicePaid(inv:any){
 const items=Array.isArray(inv?.items)?inv.items:[];let subtotal=0,taxable=0;
 for(const x of items){const a=(Number(x.qty)||1)*(Number(x.rate)||0);subtotal+=a;if(x.taxable!==false)taxable+=a;}
 const discount=Math.min(Math.max(0,Number(inv?.discount)||0),Math.max(0,subtotal));
 const ratio=subtotal>0?(subtotal-discount)/subtotal:1;
 const tax=round2(taxable*ratio*(Number(inv?.tax_rate)||0)/100);
 const total=round2(subtotal-discount+tax);
 const paid=round2((Array.isArray(inv?.payments)?inv.payments:[]).reduce((s:number,p:any)=>s+applied(p),0));
 return total>0&&paid+0.005>=total;
}
function mappedStatus(type:string){
 if(type==="email.delivered")return "delivered";
 if(type==="email.sent")return "sent";
 if(type==="email.delivery_delayed")return "delayed";
 if(["email.bounced","email.failed","email.suppressed","email.complained"].includes(type))return "failed";
 return "event";
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return out({ok:false,error:"Method not allowed"},405);
 const admin=createClient(url,service,{auth:{persistSession:false}});
 try{
  if(!cachedSigningSecret||Date.now()-cachedSecretAt>15*60*1000){
   const {data:secretRow,error:secretErr}=await admin.from("app_secrets").select("secret_value").eq("secret_name","resend_webhook_signing_secret").maybeSingle();
   const secret=String(secretRow?.secret_value||"");
   if(secretErr||!secret){console.error("resend webhook signing secret unavailable",secretErr?.message||"");return out({ok:false,error:"Webhook not configured"},503);}
   cachedSigningSecret=secret;cachedSecretAt=Date.now();
  }
  const raw=await req.text();
  const svixId=req.headers.get("svix-id")||"",svixTimestamp=req.headers.get("svix-timestamp")||"",svixSignature=req.headers.get("svix-signature")||"";
  if(!svixId||!svixTimestamp||!svixSignature)return out({ok:false,error:"Missing webhook signature"},401);
  let evt:any;
  try{evt=new Webhook(cachedSigningSecret).verify(raw,{"svix-id":svixId,"svix-timestamp":svixTimestamp,"svix-signature":svixSignature});}
  catch(e){console.error("invalid resend webhook signature",e);return out({ok:false,error:"Invalid signature"},401);}
  const type=String(evt?.type||"");const data=evt?.data||{};
  const providerMessageId=String(data?.email_id||data?.id||"").trim();
  if(!type||!providerMessageId)return out({ok:false,error:"Missing event fields"},400);
  const toRaw=data?.to;const recipient=Array.isArray(toRaw)?String(toRaw[0]||""):String(toRaw||"");
  const providerCreatedAt=evt?.created_at||data?.created_at||null;
  const {data:audit}=await admin.from("audit_log").select("entity_type,entity_id").eq("action","email_accepted").eq("related_type","resend_message").eq("related_id",providerMessageId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  const invoiceId=audit?.entity_type==="invoices"?String(audit.entity_id||""):null;
  const eventRow={event_id:svixId,provider:"resend",provider_message_id:providerMessageId,event_type:type,provider_created_at:providerCreatedAt,invoice_id:invoiceId,subject:String(data?.subject||"").slice(0,500)||null,recipient:recipient.slice(0,320)||null,payload:evt,processing_status:audit?"matched":"unmatched",processed_at:new Date().toISOString()};
  const {error:eventErr}=await admin.from("email_delivery_events").upsert(eventRow,{onConflict:"event_id",ignoreDuplicates:true});
  if(eventErr)throw eventErr;
  if(!invoiceId)return out({ok:true,matched:false,event_type:type});
  const {data:inv,error:invErr}=await admin.from("invoices").select("id,number,items,tax_rate,discount,payments,app_data").eq("id",invoiceId).is("deleted_at",null).maybeSingle();
  if(invErr||!inv)return out({ok:true,matched:true,invoice_found:false,event_type:type});
  const status=mappedStatus(type),now=new Date().toISOString();
  const currentEmail=String(inv.app_data?.emailDeliveryStatus||"").toLowerCase(),effectiveEmail=laterStatus(currentEmail,status);
  const patch:any={emailProviderMessageId:providerMessageId};
  if(effectiveEmail!==currentEmail){patch.emailDeliveryStatus=effectiveEmail;patch.emailDeliveryUpdatedAt=now;}
  if(status==="failed"&&effectiveEmail==="failed"){patch.emailDeliveryFailureType=type;patch.emailDeliveryFailureAt=now;}
  if(invoicePaid(inv)){
   const currentReceipt=String(inv.app_data?.receiptDeliveryStatus||"").toLowerCase(),effectiveReceipt=laterStatus(currentReceipt,status);
   patch.receiptEmailProviderMessageId=providerMessageId;
   if(effectiveReceipt!==currentReceipt){patch.receiptDeliveryStatus=effectiveReceipt;patch.receiptDeliveryUpdatedAt=now;}
   if(effectiveReceipt==="delivered"&&status==="delivered")patch.receiptEmailDeliveredAt=now;
   if(effectiveReceipt==="sent"&&status==="sent")patch.receiptEmailSentAt=now;
   if(effectiveReceipt==="delayed"&&status==="delayed")patch.receiptEmailDelayedAt=now;
   if(effectiveReceipt==="failed"&&status==="failed"){patch.receiptEmailFailedAt=now;patch.receiptEmailFailureType=type;}
  }
  const {error:mergeErr}=await admin.rpc("service_merge_invoice_app_data",{p_invoice_id:invoiceId,p_patch:patch});
  if(mergeErr)throw mergeErr;
  await admin.from("audit_log").insert({id:crypto.randomUUID(),action:"email_delivery_event",summary:`${type} for ${inv.number||invoiceId}`.slice(0,1000),entity_type:"invoices",entity_id:invoiceId,related_type:"resend_message",related_id:providerMessageId,source:"provider",priority:status==="failed"?"high":"normal",read:false});
  return out({ok:true,matched:true,invoice_id:invoiceId,event_type:type,status});
 }catch(e){console.error("resend-webhook",e);return out({ok:false,error:"Webhook processing failed"},500);}
});
