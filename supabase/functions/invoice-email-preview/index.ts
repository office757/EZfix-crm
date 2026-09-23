import { createClient } from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});
const esc=(v:any)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]!));
const money=(v:any)=>`$${(Number(v)||0).toFixed(2)}`;
const round2=(v:number)=>Math.round(v*100)/100;
const paymentApplied=(p:any)=>Number(p?.appliedAmount ?? p?.amount ?? 0);
const calc=(i:any)=>{
 const items=Array.isArray(i.items)?i.items:[];
 const sub=items.reduce((s:number,x:any)=>s+(Number(x.qty)||0)*(Number(x.rate)||0),0);
 const taxable=items.reduce((s:number,x:any)=>s+(x.taxable===false?0:(Number(x.qty)||0)*(Number(x.rate)||0)),0);
 const discount=Math.min(Math.max(0,Number(i.discount)||0),Math.max(0,sub));
 const discountRatio=sub>0?(sub-discount)/sub:1;
 const taxableAfterDiscount=taxable*discountRatio;
 const tax=round2(taxableAfterDiscount*(Number(i.tax_rate)||0)/100);
 const total=round2(Math.max(0,sub-discount)+tax);
 const paid=round2((Array.isArray(i.payments)?i.payments:[]).reduce((s:number,p:any)=>s+paymentApplied(p),0));
 return{sub:round2(sub),tax,discount:round2(discount),total,paid,balance:round2(Math.max(0,total-paid))};
};
const validHttps=(v:any)=>{try{const u=new URL(String(v||""));return u.protocol==="https:"?u.toString():null}catch{return null}};
const squareLinkCheck=(provider:any,link:any,invoiceNumber:any)=>{try{
 if(String(provider||"").toLowerCase()!=="square")return {url:null,reason:"payment_provider_not_square"};
 const u=new URL(String(link||""));
 if(u.protocol!=="https:"||u.hostname!=="checkout.square.site")return {url:null,reason:"not_direct_square_checkout"};
 const ref=u.searchParams.get("client_reference_id");
 if(!ref)return {url:null,reason:"missing_client_reference_id"};
 if(String(ref)!==String(invoiceNumber||""))return {url:null,reason:"client_reference_id_mismatch"};
 return {url:u.toString(),reason:null};
}catch{return {url:null,reason:"invalid_payment_link"}}};
Deno.serve(async(req)=>{try{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return json({error:"Unauthorized"},401);
 const scoped=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {data:{user}}=await scoped.auth.getUser();
 if(!user)return json({error:"Unauthorized"},401);
 const db=createClient(url,service);
 const {data:member}=await db.from("team").select("id,status").eq("auth_user_id",user.id).eq("status","active").maybeSingle();
 if(!member)return json({error:"Forbidden"},403);
 const body=await req.json().catch(()=>null),id=String(body?.invoice_id||"");
 if(!id)return json({error:"invoice_id required"},400);
 const [{data:i,error},{data:paySettings},{data:crmSettings}]=await Promise.all([
  db.from("invoices").select("id,number,customer_name,customer_email,date,due_term,items,payments,tax_rate,discount,payment_link,payment_provider").eq("id",id).is("deleted_at",null).maybeSingle(),
  db.from("ai_manager_settings").select("payment_instructions").eq("id","main").maybeSingle(),
  db.from("settings").select("email_logo_url,cc_surcharge_percent").eq("id","main").maybeSingle()
 ]);
 if(error)throw error;if(!i)return json({error:"Invoice not found"},404);
 const a=calc(i),p=paySettings?.payment_instructions||{},linkCheck=squareLinkCheck(i.payment_provider,i.payment_link,i.number),direct=linkCheck.url;
 const feeRate=Math.max(0,Number(crmSettings?.cc_surcharge_percent)||0)/100,cardFee=round2(a.balance*feeRate),cardTotal=round2(a.balance+cardFee),logoUrl=validHttps(crmSettings?.email_logo_url);
 const brand=logoUrl?`<img src="${esc(logoUrl)}" alt="EZfix Garage Doors Inc" width="220" style="display:block;max-width:220px;height:auto;border:0;outline:none;text-decoration:none">`:`<div style="font-size:22px;font-weight:700">EZfix Garage Doors Inc</div>`;
 const button=direct&&a.balance>0?`<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#f97316" style="border-radius:8px"><a href="${esc(direct)}" style="display:inline-block;padding:14px 28px;color:#fff;text-decoration:none;font-weight:800;letter-spacing:.02em">PAY NOW</a></td></tr></table>${feeRate>0?`<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;font-size:14px"><tr><td style="padding:3px 0"><strong>Credit Card Fee: ${(feeRate*100).toFixed(2).replace(/\.00$/,"")}% (${money(cardFee)})</strong></td></tr><tr><td style="padding:3px 0"><strong>Total with Card: ${money(cardTotal)}</strong></td></tr></table>`:""}`:"";
 const methods=[p.zelle?.recipient?`Zelle: ${esc(p.zelle.recipient)}`:"",p.check?.payable_to?`Check payable to: ${esc(p.check.payable_to)}`:"",p.cash?.accepted?"Cash accepted":""].filter(Boolean).join("<br>");
 const html=`<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b"><table width="100%" role="presentation"><tr><td align="center" style="padding:24px"><table width="600" role="presentation" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#111827;color:#fff;padding:24px">${brand}<div style="color:#fdba74;margin-top:8px">Invoice ${esc(i.number)}</div></td></tr><tr><td style="padding:28px"><p>Hi ${esc(i.customer_name||"there")},</p><p>Thank you for choosing EZfix Garage Doors Inc.</p><p><strong>Invoice:</strong> ${esc(i.number)}<br><strong>Balance due:</strong> ${money(a.balance)}</p>${button}${!direct&&a.balance>0?`<p style="color:#71717a;font-size:13px">Online PAY NOW is unavailable because this invoice does not have a verified direct Square checkout link tied to this exact invoice.</p>`:""}${methods?`<p style="margin-top:24px"><strong>Other payment options</strong><br>${methods}</p>`:""}<p style="margin-top:28px">Thank you for your business.</p></td></tr></table></td></tr></table></body></html>`;
 return json({ok:true,preview_only:true,invoice:{id:i.id,number:i.number,to:i.customer_email||null,balance:a.balance,total:a.total,paid:a.paid,tax:a.tax,discount:a.discount},payment:{provider:i.payment_provider||null,direct_square_link:direct,verified_direct_square:!!direct,show_pay_now:!!button,client_reference_matches:!!direct,verification_error:linkCheck.reason,card_fee_rate:feeRate,card_fee:cardFee,total_with_card:cardTotal},branding:{logo_url:logoUrl,uses_image_logo:!!logoUrl},subject:`Invoice ${i.number} — EZfix Garage Doors Inc`,html});
}catch(e:any){console.error("invoice-email-preview failed",e);return json({ok:false,error:e?.message||"Preview failed"},500)}});
