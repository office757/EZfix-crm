import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"content-type":"application/json"}});
const validEmail=(s:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors}); if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth=req.headers.get("authorization")||""; if(!auth.startsWith("Bearer "))return json({error:"Unauthorized"},401);
  const scoped=createClient(url,anon,{global:{headers:{Authorization:auth}}}); const {data:{user}}=await scoped.auth.getUser(auth.slice(7)); if(!user)return json({error:"Unauthorized"},401);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:caller}=await admin.from("team").select("id,role,status").eq("auth_user_id",user.id).maybeSingle();
  if(!caller||caller.role!=="owner"||caller.status!=="active")return json({error:"Owner access required"},403);
  const body=await req.json().catch(()=>({})),action=String(body.action||"").toLowerCase(),teamId=String(body.teamId||"").trim();
  if(!teamId)return json({error:"teamId is required"},400);
  const {data:member}=await admin.from("team").select("id,name,email,role,status,auth_user_id").eq("id",teamId).maybeSingle(); if(!member)return json({error:"Team member not found"},404);
  if(member.role==="owner")return json({error:"Owner credentials cannot be managed here"},403);
  let uid=member.auth_user_id as string|null;
  if(action==="status"){let au:any=null;if(uid){const {data}=await admin.auth.admin.getUserById(uid);au=data?.user||null}return json({ok:true,linked:!!uid,loginEmail:au?.email||member.email||null,disabled:au?.banned_until?new Date(au.banned_until)>new Date():false,lastSignInAt:au?.last_sign_in_at||null});}
  if(action==="create"){
    const email=String(body.email||member.email||"").trim().toLowerCase(),password=String(body.password||"");
    if(!validEmail(email))return json({error:"Valid login email required"},400); if(password.length<10)return json({error:"Password must be at least 10 characters"},400);
    if(uid)return json({error:"Login already exists; use update_email or set_password"},409);
    const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{team_id:member.id,role:member.role,name:member.name}}); if(error)throw error; uid=data.user.id;
    const {error:linkErr}=await admin.from("team").update({auth_user_id:uid,email,updated_at:new Date().toISOString()}).eq("id",member.id).is("auth_user_id",null); if(linkErr)throw linkErr;
  } else {
    if(!uid)return json({error:"Create login first"},409);
    if(action==="update_email"){const email=String(body.email||"").trim().toLowerCase();if(!validEmail(email))return json({error:"Valid login email required"},400);const {error}=await admin.auth.admin.updateUserById(uid,{email,email_confirm:true});if(error)throw error;await admin.from("team").update({email,updated_at:new Date().toISOString()}).eq("id",member.id);}
    else if(action==="set_password"){const password=String(body.password||"");if(password.length<10)return json({error:"Password must be at least 10 characters"},400);const {error}=await admin.auth.admin.updateUserById(uid,{password});if(error)throw error;}
    else if(action==="disable"){const {error}=await admin.auth.admin.updateUserById(uid,{ban_duration:"876000h"});if(error)throw error;}
    else if(action==="enable"){const {error}=await admin.auth.admin.updateUserById(uid,{ban_duration:"none"});if(error)throw error;}
    else return json({error:"Unsupported action"},400);
  }
  await admin.from("audit_log").insert({id:crypto.randomUUID(),action:"technician_login_"+action,summary:`Owner ${action} login access for ${member.name||member.id}`,entity_type:"team",entity_id:member.id,source:"owner_login_management",created_by_team_id:caller.id,read:false});
  return json({ok:true,action,teamId:member.id,authUserId:uid});
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Account action failed"},400)}
});