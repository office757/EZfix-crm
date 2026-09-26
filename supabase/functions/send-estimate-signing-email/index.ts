import { createClient } from "npm:@supabase/supabase-js@2";

const URL=Deno.env.get("SUPABASE_URL")!;
const ANON=Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND=Deno.env.get("RESEND_API_KEY")!;
const PUBLIC_BASE=(Deno.env.get("CRM_PUBLIC_BASE_URL")||"https://ezfix-crm-sms-length-fixed.vercel.app").replace(/\/$/,"");
const MAILBOX=["office","ezfixgaragedoorsinc.com"].join("@");
const FROM="EZfix Garage Doors Inc <"+MAILBOX+">";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const out=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:CORS});
const esc=(s:any)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
const money=(n:any)=>"$"+(Number(n)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

function estimateTotal(e:any){
  const items=Array.isArray(e.items)?e.items:[];
  const subtotal=items.reduce((s:number,x:any)=>s+(Number(x.qty)||0)*(Number(x.rate)||0),0);
  const taxable=items.reduce((s:number,x:any)=>s+(x.taxable===false?0:(Number(x.qty)||0)*(Number(x.rate)||0)),0);
  const discount=Math.min(Number(e.discount)||0,subtotal);
  const ratio=subtotal>0?(subtotal-discount)/subtotal:1;
  const tax=Math.round((taxable*ratio*((Number(e.tax_rate)||0)/100))*100)/100;
  return Math.round((subtotal-discount+tax)*100)/100;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return out({ok:false,error:"Method not allowed"},405);

  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return out({ok:false,error:"Unauthorized"},401);

  const scoped=createClient(URL,ANON,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await scoped.auth.getUser();
  if(!user)return out({ok:false,error:"Unauthorized"},401);

  const admin=createClient(URL,SERVICE);
  const {data:member}=await admin.from("team").select("id,name,role,status").eq("auth_user_id",user.id).eq("status","active").maybeSingle();
  if(!member)return out({ok:false,error:"Forbidden"},403);

  const body=await req.json().catch(()=>({}));
  const estimateId=String(body?.estimate_id||"").trim();
  if(!estimateId||estimateId.length>160)return out({ok:false,error:"estimate_id required"},400);

  const {data:estimate,error:estimateError}=await admin.from("estimates")
    .select("id,number,customer_id,customer_name,customer_email,items,tax_rate,discount,deposit_required,status,deleted_at")
    .eq("id",estimateId).is("deleted_at",null).maybeSingle();
  if(estimateError)return out({ok:false,error:"Could not load estimate"},500);
  if(!estimate)return out({ok:false,error:"Estimate not found"},404);

  let allowed=["owner","admin","dispatcher","office"].includes(String(member.role||"").toLowerCase());
  if(!allowed&&String(member.role||"").toLowerCase()==="technician"){
    const {data:job}=await admin.from("jobs").select("id").eq("technician_id",member.id).is("deleted_at",null).or(`estimate_id.eq.${estimate.id},id.eq.${estimate.converted_job_id||"__none__"}`).limit(1).maybeSingle();
    allowed=!!job;
  }
  if(!allowed)return out({ok:false,error:"Estimate is not available to this team member"},403);

  let email=String(estimate.customer_email||"").trim().toLowerCase();
  if(!email&&estimate.customer_id){
    const {data:c}=await admin.from("customers").select("email").eq("id",estimate.customer_id).is("deleted_at",null).maybeSingle();
    email=String(c?.email||"").trim().toLowerCase();
  }
  if(!email||!email.includes("@"))return out({ok:false,error:"Customer email is missing"},409);

  const {data:issued,error:issueError}=await scoped.rpc("issue_public_estimate_signing_token",{p_estimate_id:estimateId});
  if(issueError||!issued?.token)return out({ok:false,error:issueError?.message||"Could not create signing link"},400);

  const link=PUBLIC_BASE+"/estimate-sign.html?estimate="+encodeURIComponent(estimate.id)+"&token="+encodeURIComponent(issued.token);
  const total=estimateTotal(estimate);
  const subject=`Review & Sign Estimate ${estimate.number} from EZfix Garage Doors Inc`;
  const text=`Hi ${estimate.customer_name||"there"},\n\nYour EZfix Garage Doors Inc estimate ${estimate.number} is ready for review. Total: ${money(total)}.\n\nReview and sign securely: ${link}\n\nIf the estimate changes, this link will automatically become invalid and a new one must be issued.\n\nEZfix Garage Doors Inc\n${MAILBOX}`;
  const html=`<div style="background:#f4f2ee;padding:24px 12px;font-family:Arial,sans-serif;color:#171717"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e7e2d8;border-radius:16px;overflow:hidden"><div style="background:#050505;padding:22px;color:#fff"><div style="font-size:24px;font-weight:900"><span style="color:#f7941d">EZfix</span> Garage Doors Inc</div></div><div style="padding:24px"><p style="font-size:17px">Hi ${esc(estimate.customer_name||"there")},</p><p>Your estimate <b>${esc(estimate.number)}</b> is ready to review.</p><div style="background:#faf8f4;border-radius:12px;padding:16px;margin:18px 0"><div style="font-size:12px;color:#777;text-transform:uppercase;font-weight:700">Estimate total</div><div style="font-size:28px;font-weight:900;margin-top:4px">${money(total)}</div></div><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#f7941d;border-radius:10px"><a href="${esc(link)}" style="display:inline-block;padding:14px 22px;color:#111;text-decoration:none;font-weight:900">Review &amp; Sign Estimate</a></td></tr></table><p style="font-size:12px;color:#777;line-height:1.5;margin-top:18px">For security, the link expires automatically and becomes invalid if the estimate is changed.</p></div></div></div>`;

  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+RESEND,"Content-Type":"application/json"},body:JSON.stringify({from:FROM,to:[email],subject,reply_to:MAILBOX,text,html})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){
    await admin.from("public_estimate_signing_tokens").update({revoked_at:new Date().toISOString()}).eq("estimate_id",estimateId).eq("token_hash",await (async()=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(issued.token).toLowerCase())))).map(b=>b.toString(16).padStart(2,"0")).join(""))());
    return out({ok:false,error:"Email provider rejected the signing email"},502);
  }

  await admin.from("audit_log").insert({
    id:crypto.randomUUID(),
    action:"estimate_signing_email_sent",
    summary:`Estimate ${estimate.number} signing email accepted by Resend for ${email}`.slice(0,1000),
    entity_type:"estimates",
    entity_id:estimate.id,
    related_type:"resend_message",
    related_id:result.id?String(result.id):null,
    source:"provider",
    priority:"normal",
    created_by_team_id:member.id
  });

  return out({ok:true,provider_message_id:result.id||null,estimate_id:estimate.id,expires_at:issued.expires_at});
});
