import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const SQUARE_VERSION="2026-09-16";
function json(data:unknown,status=200){return Response.json(data,{status,headers:{...cors,"Content-Type":"application/json"}})}
function cents(value:unknown){return Math.round((Number(value)||0)*100)}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="GET"&&req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,squareToken=Deno.env.get("SQUARE_ACCESS_TOKEN");
  if(!squareToken)return json({ok:false,configured:false,error:"Square is not configured"},503);
  const requestUrl=new URL(req.url);
  let invoiceId=requestUrl.searchParams.get("invoice_id")||"",accessToken=requestUrl.searchParams.get("access_token")||"";
  if(req.method==="POST"){const body=await req.json().catch(()=>({}));invoiceId=String(body?.invoice_id||invoiceId||"").trim();accessToken=String(body?.access_token||accessToken||"").trim()}
  if(!invoiceId||invoiceId.length>120)return json({ok:false,error:"invoice_id required"},400);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
  let authorized=false;
  if(/^[0-9a-fA-F]{64}$/.test(accessToken)){
   const {data:publicInvoice,error:tokenErr}=await admin.rpc("get_public_invoice_payment_page",{p_invoice_id:invoiceId,p_access_token:accessToken});
   authorized=!tokenErr&&!!publicInvoice;
  }
  if(!authorized){
   const auth=req.headers.get("authorization")||"",jwt=auth.startsWith("Bearer ")?auth.slice(7).trim():"";
   if(jwt){const {data:userData,error:userErr}=await admin.auth.getUser(jwt);if(!userErr&&userData?.user?.id){const {data:caller}=await admin.from("team").select("id,role,status").eq("auth_user_id",userData.user.id).maybeSingle();authorized=!!caller&&caller.status==="active"&&["owner","admin","dispatcher","office"].includes(String(caller.role||"").toLowerCase())}}
  }
  if(!authorized)return json({ok:false,error:"Authorized staff session or valid invoice access token required"},401);
  const {data:inv,error:invErr}=await admin.from("invoices").select("id,number,payment_provider,payment_link,payments,app_data,deleted_at").eq("id",invoiceId).is("deleted_at",null).maybeSingle();
  if(invErr)throw invErr;
  if(!inv||String(inv.payment_provider||"").toLowerCase()!=="square")return json({ok:false,error:"Square invoice not found"},404);
  const app=(inv.app_data&&typeof inv.app_data==="object")?inv.app_data:{};
  const linkId=String(app.squarePaymentLinkId||"").trim();
  if(!linkId)return json({ok:true,paid:false,status:"missing_payment_link_id"});
  const squareHeaders={"Authorization":`Bearer ${squareToken}`,"Content-Type":"application/json","Square-Version":SQUARE_VERSION};
  const linkRes=await fetch(`https://connect.squareup.com/v2/online-checkout/payment-links/${encodeURIComponent(linkId)}`,{headers:squareHeaders});
  const linkJson=await linkRes.json().catch(()=>({}));
  if(!linkRes.ok)throw new Error(linkJson?.errors?.[0]?.detail||"Could not retrieve Square payment link");
  const orderId=String(linkJson?.payment_link?.order_id||"").trim();
  if(!orderId)return json({ok:true,paid:false,status:"square_order_pending"});
  const orderRes=await fetch(`https://connect.squareup.com/v2/orders/${encodeURIComponent(orderId)}`,{headers:squareHeaders});
  const orderJson=await orderRes.json().catch(()=>({}));
  if(!orderRes.ok)throw new Error(orderJson?.errors?.[0]?.detail||"Could not retrieve Square order");
  const tenders=Array.isArray(orderJson?.order?.tenders)?orderJson.order.tenders:[];
  const paymentIds=[...new Set(tenders.map((t:any)=>String(t?.payment_id||t?.id||"")).filter(Boolean))];
  if(!paymentIds.length)return json({ok:true,paid:false,status:"awaiting_square_payment",order_id:orderId});
  let completed:any=null;
  for(const paymentId of paymentIds){const payRes=await fetch(`https://connect.squareup.com/v2/payments/${encodeURIComponent(paymentId)}`,{headers:squareHeaders});const payJson=await payRes.json().catch(()=>({}));if(!payRes.ok)continue;const p=payJson?.payment;if(p&&String(p.status||"").toUpperCase()==="COMPLETED"&&String(p.order_id||orderId)===orderId){completed=p;break}}
  if(!completed)return json({ok:true,paid:false,status:"square_payment_not_completed",order_id:orderId});
  const expectedBase=Number(app.squareCardBase||0),expectedFee=Number(app.squareCardFee||0),expectedCharged=Number(app.squareCardTotal||0),actualCents=Number(completed?.amount_money?.amount||0);
  if(expectedBase<=0||expectedCharged<=0||actualCents!==cents(expectedCharged)){
   await admin.from("audit_log").insert({id:`audit_sq_review_${Date.now()}_${crypto.randomUUID().slice(0,8)}`,action:"square_payment_review_required",summary:`Square payment amount did not match invoice ${inv.number||inv.id}`,entity_type:"invoices",entity_id:inv.id,source:"square_sync",priority:"high",read:false});
   return json({ok:true,paid:false,requires_review:true,status:"amount_mismatch"});
  }
  const paymentId=String(completed.id||"");
  if(!paymentId)return json({ok:false,error:"Square payment id missing"},502);
  const paidAt=String(completed.created_at||new Date().toISOString());
  const syncEventId=`sync_${paymentId}`;
  const {data:recorded,error:recordErr}=await admin.rpc("record_square_payment_from_webhook",{p_event_id:syncEventId,p_event_type:"payment.sync",p_merchant_id:null,p_invoice_id:inv.id,p_payment_id:paymentId,p_order_id:orderId,p_paid_at:paidAt,p_applied_amount:expectedBase,p_card_fee:expectedFee,p_charged_amount:expectedCharged,p_receipt_url:completed.receipt_url||null,p_card_brand:completed?.card_details?.card?.card_brand||null,p_last4:completed?.card_details?.card?.last_4||null});
  if(recordErr)throw recordErr;
  return json({ok:true,paid:true,invoice_id:inv.id,invoice_number:inv.number,payment_id:paymentId,paid_at:paidAt,receipt_ready:true,receipt_delivery_status:recorded?.receipt_delivery_status||app.receiptDeliveryStatus||"pending_manual_send",already_recorded:!!recorded?.already_recorded});
 }catch(e){console.error("sync-square-payment",e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500)}
});