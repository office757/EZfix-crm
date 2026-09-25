import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyWebhook } from "npm:@inkbox/sdk";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});

Deno.serve(async(req:Request)=>{
  if(req.method!=="GET"&&req.method!=="POST") return json({error:"method_not_allowed"},405);
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) return json({error:"unauthorized"},401);

  const url=Deno.env.get("SUPABASE_URL")!;
  const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const scoped=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:userError}=await scoped.auth.getUser();
  if(userError||!user) return json({error:"unauthorized"},401);

  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member,error:memberError}=await admin.from("team").select("role,status").eq("auth_user_id",user.id).maybeSingle();
  if(memberError||!member||!["owner","admin"].includes(String(member.role||"").toLowerCase())||String(member.status||"").toLowerCase()!=="active"){
    return json({error:"forbidden"},403);
  }

  return json({
    runtime_loaded:true,
    typeof_verifyWebhook:typeof verifyWebhook,
    is_function:typeof verifyWebhook==="function",
  });
});
