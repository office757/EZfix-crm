import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(b:unknown,s=200)=>Response.json(b,{status:s,headers:{...cors,"Content-Type":"application/json"}});
const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
function applied(p:any){const n=Number(p?.appliedAmount ?? p?.amount ?? 0);return Number.isFinite(n)?Math.max(0,n):0;}
const deliveryRank:Record<string,number>={"":0,pending_manual_send:0,ready:0,accepted:1,sent:2,delayed:3,delivered:4,failed:5};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return out({ok:false,error:"Method not allowed"},405);
 try{
  const auth=req.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return out({ok:false,error:"Authentication required"},401);
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const scoped=createClient(url,anon,{global:{headers:{Authorization:auth}}});const {data:{user}}=await scoped.auth.getUser();if(!user)return out({ok:false,error:"Authentication required"},401);
  const admin=createClient(url,service,{auth:{persistSession:false}});const {data:member}=await admin.from("team").select("id,role,status").eq("auth_user_id",user.id).eq("status","active").maybeSingle();if(!member)return out({ok:false,error:"Active team membership required"},403);
  const body=await req.json().catch(()=>({}));const invoiceId=String(body?.invoice_id||"").trim(),providerId=String(body?.provider_message_id||"").trim();if(!invoiceId||!providerId)return out({ok:false,error:"invoice_id and provider_message_id required"},400);
  const {data:inv}=await admin.from("invoices").select("id,number,items,tax_rate,discount,payments,app_data,job_id,customer_id,deleted_at").eq("id",invoiceId).is("deleted_at",null).maybeSingle();if(!inv)return out({ok:false,error:"Invoice not found"},404);
  const role=String(member.role||"").toLowerCase(),office=["owner","admin","dispatcher","office"].includes(role);let allowed=office;
  if(!allowed&&role==="technician"){let assigned=false;if(inv.job_id){const {data:j}=await admin.from("jobs").select("technician_id").eq("id",inv.job_id).is("deleted_at",null).maybeSingle();assigned=String(j?.technician_id||"")===String(member.id);}allowed=assigned||String(inv.app_data?.createdByTechnicianId||"")===String(member.id);}
  if(!allowed)return out({ok:false,error:"Invoice not available to this team member"},403);
  const {data:audit}=await admin.from("audit_log").select("id,created_at").eq("action","email_accepted").eq("entity_type","invoices").eq("entity_id",invoiceId).eq("related_id",providerId).order("created_at",{ascending:false}).limit(1).maybeSingle();if(!audit)return out({ok:false,error:"No accepted receipt email matched this provider message"},409);
  const items=Array.isArray(inv.items)?inv.items:[];let subtotal=0,taxable=0;for(const x of items){const amount=(Number(x.qty)||1)*(Number(x.rate)||0);subtotal+=amount;if(x.taxable!==false)taxable+=amount;}
  const discount=Math.min(Math.max(0,Number(inv.discount)||0),Math.max(0,subtotal)),ratio=subtotal>0?(subtotal-discount)/subtotal:1;
  const tax=round2(taxable*ratio*(Number(inv.tax_rate)||0)/100),total=round2(subtotal-discount+tax),paid=round2((Array.isArray(inv.payments)?inv.payments:[]).reduce((s:number,p:any)=>s+applied(p),0));
  if(total<=0||paid+0.005<total)return out({ok:false,error:"Invoice is not paid in full"},409);
  const now=new Date().toISOString(),current=String(inv.app_data?.receiptDeliveryStatus||"").toLowerCase();
  const finalStatus=(deliveryRank[current]||0)>deliveryRank.accepted?current:"accepted";
  const patch:any={receiptEmailAcceptedAt:inv.app_data?.receiptEmailAcceptedAt||now,receiptEmailProviderMessageId:providerId};
  if(finalStatus==="accepted"){patch.receiptDeliveryStatus="accepted";patch.receiptDeliveryUpdatedAt=now;}
  const {error:updateErr}=await admin.rpc("service_merge_invoice_app_data",{p_invoice_id:invoiceId,p_patch:patch});if(updateErr)throw updateErr;
  await admin.from("audit_log").insert({id:crypto.randomUUID(),action:"receipt_email_accepted",summary:`Receipt email accepted by provider for ${inv.number||invoiceId}`,entity_type:"invoices",entity_id:invoiceId,related_type:"resend_message",related_id:providerId,source:"provider",priority:"normal",read:false,created_by_team_id:member.id});
  return out({ok:true,invoice_id:invoiceId,receipt_delivery_status:finalStatus,provider_message_id:providerId});
 }catch(e){console.error("mark-receipt-delivery",e);return out({ok:false,error:e instanceof Error?e.message:String(e)},500)}
});
