import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const out=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:CORS});
const text=(v:any)=>String(v??"").trim();
const lower=(v:any)=>text(v).toLowerCase();
const URL=Deno.env.get("SUPABASE_URL")!,ANON=Deno.env.get("SUPABASE_ANON_KEY")!,SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
 if(req.method!=="POST")return out({ok:false,error:"Method not allowed"},405);
 try{
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))return out({ok:false,error:"Unauthorized"},401);
  const scoped=createClient(URL,ANON,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await scoped.auth.getUser();
  if(!user)return out({ok:false,error:"Unauthorized"},401);
  const admin=createClient(URL,SERVICE,{auth:{persistSession:false}});
  const {data:member}=await admin.from("team").select("id,name,role,status").eq("auth_user_id",user.id).maybeSingle();
  if(!member||lower(member.status)!=="active")return out({ok:false,error:"Forbidden"},403);
  if(!["owner","admin","office","dispatcher"].includes(lower(member.role)))return out({ok:false,error:"Office approval access required"},403);

  const body=await req.json().catch(()=>({}));
  const approvalId=text(body?.approval_id),decision=lower(body?.decision);
  if(!approvalId)return out({ok:false,error:"approval_id required"},400);
  if(!["approved","rejected"].includes(decision))return out({ok:false,error:"decision must be approved or rejected"},400);

  const {data:approval,error:approvalErr}=await admin.from("ai_approvals").select("id,status,domain,action").eq("id",approvalId).maybeSingle();
  if(approvalErr)throw approvalErr;
  if(!approval)return out({ok:false,error:"Approval not found"},404);
  if(approval.status!=="pending")return out({ok:false,error:"Only pending approvals can be decided"},409);

  const {data:updated,error:updateErr}=await admin.from("ai_approvals").update({
    status:decision,
    decided_at:new Date().toISOString(),
    decided_by_team_id:member.id
  }).eq("id",approvalId).eq("status","pending").select("id,status,decided_at,decided_by_team_id").maybeSingle();
  if(updateErr)throw updateErr;
  if(!updated)return out({ok:false,error:"Approval changed before decision could be saved"},409);

  await admin.from("audit_log").insert({
    id:crypto.randomUUID(),
    action:decision==="approved"?"ai_approval_approved":"ai_approval_rejected",
    summary:`AI approval ${approvalId} ${decision} by ${member.name||member.id}`,
    entity_type:"ai_approvals",
    entity_id:approvalId,
    source:"ai",
    priority:"normal",
    read:false,
    created_by_team_id:member.id
  });

  return out({ok:true,approval:updated});
 }catch(e:any){
  console.error("ai-approval-decision",e);
  return out({ok:false,error:e?.message||"Approval decision failed"},500);
 }
});