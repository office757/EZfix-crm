import { createClient } from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, adminKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, resend=Deno.env.get("RESEND_API_KEY")!;
const mailbox=["office","ezfixgaragedoorsinc.com"].join("@"), from="EZfix Garage Doors Inc <"+mailbox+">";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"content-type":"application/json"}});
const hex=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("");
const normalizeAttachments=(raw:any)=>Array.isArray(raw)?raw.filter((a:any)=>a&&a.content).map((a:any)=>({filename:String(a.filename||"attachment"),content:String(a.content),content_id:a.content_id?String(a.content_id):null,content_type:a.content_type?String(a.content_type):null})):[];
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors}); if(req.method!=="POST")return out({error:"method"},405);
 const auth=req.headers.get("authorization")||""; if(!auth.startsWith("Bearer "))return out({error:"unauthorized"},401);
 const scoped=createClient(url,anon,{global:{headers:{Authorization:auth}}}); const {data:user}=await scoped.auth.getUser(auth.slice(7)); if(!user.user)return out({error:"unauthorized"},401);
 const admin=createClient(url,adminKey); const {data:member}=await admin.from("team").select("id,name,role,status").eq("auth_user_id",user.user.id).eq("status","active").maybeSingle(); if(!member)return out({error:"forbidden"},403);
 const body=await req.json().catch(()=>null); if(!body)return out({error:"bad request"},400);
 const approvalId=String(body.approval_id||"").trim(); const directOwner=String(member.role||"").toLowerCase()==="owner";
 const entityType=String(body.entity_type||"").trim(), entityId=String(body.entity_id||"").trim();
 let directTechnician=false;
 if(!approvalId && String(member.role||"").toLowerCase()==="technician" && entityType==="invoices" && entityId){
   const {data:inv}=await admin.from("invoices").select("id,customer_id,job_id,customer_email,app_data").eq("id",entityId).is("deleted_at",null).maybeSingle();
   if(inv){
     const target=String(body.to||"").trim().toLowerCase();
     let recipientMatches=String(inv.customer_email||"").trim().toLowerCase()===target;
     if(!recipientMatches && inv.customer_id){ const {data:cust}=await admin.from("customers").select("email").eq("id",inv.customer_id).is("deleted_at",null).maybeSingle(); recipientMatches=String(cust?.email||"").trim().toLowerCase()===target; }
     let assigned=false;
     if(inv.job_id){ const {data:job}=await admin.from("jobs").select("technician_id").eq("id",inv.job_id).is("deleted_at",null).maybeSingle(); assigned=job?.technician_id===member.id; }
     const createdBy=inv.app_data?.createdByTechnicianId===member.id || inv.app_data?.created_by_technician_id===member.id;
     directTechnician=recipientMatches && (assigned||createdBy);
   }
 }
 if(!approvalId&&!directOwner&&!directTechnician)return out({error:"Technicians can only email invoices for their assigned work or invoices they created in Quick Pay."},403);
 const to=String(body.to||"").trim(),subject=String(body.subject||"").trim(),text=String(body.text||"").trim(),html=String(body.html||"").trim();
 if(!to.includes("@")||!subject||(!text&&!html))return out({error:"missing fields"},400);
 const attachments=normalizeAttachments(body.attachments); const attachmentHash=attachments.length?await hex(JSON.stringify(attachments)):null; let claimToken:string|null=null;
 if(approvalId){
  const contentHash=await hex(JSON.stringify({channel:"email",recipient:to,subject,text,html}));
  const {data:a}=await admin.from("outbound_communication_approvals").select("id,channel,recipient,subject,content_hash,attachment_hash,status,sent_at").eq("id",approvalId).maybeSingle();
  if(!a||a.channel!=="email"||a.status!=="approved"||a.sent_at)return out({error:"approval invalid, not approved, or already used"},403);
  if(a.recipient!==to||String(a.subject||"")!==subject||a.content_hash!==contentHash)return out({error:"approved content does not match request"},409);
  const approvedAttachmentHash=a.attachment_hash?String(a.attachment_hash):null; if(approvedAttachmentHash!==attachmentHash)return out({error:attachments.length?"approved attachments do not match request":"approved attachment is missing from request"},409);
  claimToken=crypto.randomUUID(); const claimTime=new Date().toISOString();
  const {data:claimed,error:claimError}=await admin.from("outbound_communication_approvals").update({status:"sending",claimed_at:claimTime,claim_token:claimToken,last_error:null}).eq("id",approvalId).eq("status","approved").is("sent_at",null).is("claim_token",null).select("id").maybeSingle();
  if(claimError||!claimed)return out({error:"approval already claimed or no longer sendable"},409);
 }
 const payload:any={from,to:[to],subject,reply_to:mailbox}; if(text)payload.text=text;if(html)payload.html=html;if(attachments.length)payload.attachments=attachments.map((a:any)=>({filename:a.filename,content:a.content,content_id:a.content_id||undefined,content_type:a.content_type||undefined}));
 try{
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"authorization":"Bearer "+resend,"content-type":"application/json"},body:JSON.stringify(payload)}); const result=await response.json().catch(()=>({}));
  if(!response.ok){if(approvalId&&claimToken) await admin.from("outbound_communication_approvals").update({status:"approved",claimed_at:null,claim_token:null,last_error:"provider rejected request"}).eq("id",approvalId).eq("status","sending").eq("claim_token",claimToken).is("sent_at",null);return out({success:false,error:"provider rejected request"},502);}
  if(approvalId&&claimToken){const {data:marked,error:markError}=await admin.from("outbound_communication_approvals").update({status:"sent",sent_at:new Date().toISOString(),provider_message_id:result.id||null,last_error:null}).eq("id",approvalId).eq("status","sending").eq("claim_token",claimToken).is("sent_at",null).select("id").maybeSingle();if(markError||!marked)return out({success:false,error:"sent but approval finalization failed; do not retry automatically",providerMessageId:result.id||null},500);}
  let auditRecorded=true;
  try{
   const entityType=String(body.entity_type||"communication").slice(0,80)||"communication";
   const entityId=body.entity_id?String(body.entity_id).slice(0,160):null;
   const {error:auditError}=await admin.from("audit_log").insert({
    id:crypto.randomUUID(),
    action:"email_accepted",
    summary:`Email accepted by Resend for ${to}: ${subject}`.slice(0,1000),
    entity_type:entityType,
    entity_id:entityId,
    related_type:"resend_message",
    related_id:result.id?String(result.id):null,
    source:"provider",
    priority:"normal",
    created_by_team_id:member.id
   });
   if(auditError){auditRecorded=false;console.error("email audit insert failed",auditError);}
  }catch(auditException){auditRecorded=false;console.error("email audit exception",auditException);}
  return out({success:true,providerMessageId:result.id||null,approvalId:approvalId||null,directOwner:!approvalId,attachmentCount:attachments.length,auditRecorded});
 }catch(e){if(approvalId&&claimToken) await admin.from("outbound_communication_approvals").update({last_error:"provider outcome unknown; do not retry automatically"}).eq("id",approvalId).eq("status","sending").eq("claim_token",claimToken).is("sent_at",null);return out({success:false,error:"provider outcome unknown; do not retry automatically",retrySafe:false},502);}
});