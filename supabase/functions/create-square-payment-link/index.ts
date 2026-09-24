import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const SQUARE_VERSION="2026-09-16";
const CRM_PUBLIC_URL="https://ezfix-crm-sms-length-fixed.vercel.app/";
function round2(n:number){return Math.round((n+Number.EPSILON)*100)/100;}
function appliedAmount(p:any){const n=Number(p?.appliedAmount ?? p?.amount ?? 0);return Number.isFinite(n)?Math.max(0,n):0;}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization")||""; if(!auth.startsWith("Bearer "))throw new Error("Authentication required");
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!; const sb=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:ue}=await sb.auth.getUser(); if(ue||!user)throw new Error("Authentication required");
  const {invoice_id}=await req.json(); if(!invoice_id)throw new Error("invoice_id required");
  const {data:team,error:te}=await sb.from("team").select("id,role,status").eq("auth_user_id",user.id).eq("status","active").maybeSingle(); if(te||!team)throw new Error("Active team membership required");
  const {data:inv,error:ie}=await sb.from("invoices").select("id,number,customer_name,customer_email,customer_phone,items,tax_rate,discount,payments,app_data,row_version,deleted_at").eq("id",invoice_id).is("deleted_at",null).maybeSingle(); if(ie||!inv)throw new Error("Invoice not available");
  const role=String(team.role||"").toLowerCase(),office=["owner","admin","dispatcher","office"].includes(role); if(!office&&String(inv.app_data?.createdByTechnicianId||"")!==String(team.id))throw new Error("Invoice not available to this technician");
  const token=Deno.env.get("SQUARE_ACCESS_TOKEN"),locationId=Deno.env.get("SQUARE_LOCATION_ID"); if(!token||!locationId)return Response.json({ok:false,configured:false,error:"Square credentials are not configured"},{status:503,headers:cors});
  const items=Array.isArray(inv.items)?inv.items:[]; let subtotal=0,taxable=0; for(const x of items){const amount=(Number(x.qty)||1)*(Number(x.rate)||0);subtotal+=amount;if(x.taxable!==false)taxable+=amount;}
  const discount=Math.min(Math.max(0,Number(inv.discount)||0),Math.max(0,subtotal)); const discountRatio=subtotal>0?(subtotal-discount)/subtotal:1; const taxableAfterDiscount=taxable*discountRatio; const tax=round2(taxableAfterDiscount*(Number(inv.tax_rate)||0)/100); const invoiceTotal=round2(subtotal-discount+tax);
  const paid=round2((Array.isArray(inv.payments)?inv.payments:[]).reduce((s:number,p:any)=>s+appliedAmount(p),0)); const base=round2(Math.max(0,invoiceTotal-paid)); if(base<=0)throw new Error("Invoice balance must be greater than zero");
  const fee=round2(base*0.035),total=round2(base+fee); const redirectUrl=`${CRM_PUBLIC_URL}?customer_invoice=${encodeURIComponent(inv.id)}&square_return=1`;
  const idempotencyKey=`inv-${inv.id}-${Number(inv.row_version)||1}-${Math.round(total*100)}`.slice(0,45);
  const body:any={idempotency_key:idempotencyKey,quick_pay:{name:"EZfix Invoice "+inv.number,price_money:{amount:Math.round(total*100),currency:"USD"},location_id:locationId},checkout_options:{ask_for_shipping_address:false,redirect_url:redirectUrl},payment_note:"Invoice "+inv.number+" | balance "+base.toFixed(2)+" + card fee "+fee.toFixed(2)};
  const pre:any={}; if(inv.customer_email)pre.buyer_email=String(inv.customer_email); if(inv.customer_phone)pre.buyer_phone_number=String(inv.customer_phone); if(Object.keys(pre).length)body.pre_populated_data=pre;
  const sq=await fetch("https://connect.squareup.com/v2/online-checkout/payment-links",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json","Square-Version":SQUARE_VERSION},body:JSON.stringify(body)}); const out=await sq.json(); if(!sq.ok)throw new Error(out?.errors?.[0]?.detail||"Square payment link creation failed");
  const checkout=out?.payment_link?.url; if(!checkout||!checkout.startsWith("https://square.link/"))throw new Error("Square returned an unexpected checkout URL");
  const admin=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!); await admin.from("invoices").update({payment_provider:"square",payment_link:checkout,app_data:{...(inv.app_data||{}),squarePaymentLinkId:out?.payment_link?.id||null,squareOrderId:out?.payment_link?.order_id||null,squareCardBase:base,squareCardFee:fee,squareCardTotal:total,squareInvoiceTotal:invoiceTotal,squarePaidBeforeLink:paid,squareInvoiceRowVersionAtLink:Number(inv.row_version)||1,squareSyncStatus:"awaiting_payment",squareLinkCreatedAt:new Date().toISOString()}}).eq("id",inv.id);
  return Response.json({ok:true,configured:true,invoice_id:inv.id,invoice_number:inv.number,checkout_url:checkout,redirect_url:redirectUrl,invoice_total:invoiceTotal,paid_before_link:paid,base,card_fee:fee,total},{headers:{...cors,"Content-Type":"application/json"}});
 }catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:400,headers:{...cors,"Content-Type":"application/json"}})}
});