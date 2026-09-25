import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const J=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const URL=Deno.env.get("SUPABASE_URL")||"",ANON=Deno.env.get("SUPABASE_ANON_KEY")||"",SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return J({ok:false,error:"Method not allowed"},405);
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))return J({ok:false,error:"Unauthorized"},401);
  if(!URL||!ANON||!SERVICE)return J({ok:false,error:"Server environment incomplete"},500);

  const uc=createClient(URL,ANON,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await uc.auth.getUser();
  if(!user)return J({ok:false,error:"Unauthorized"},401);

  const db=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member}=await db.from("team").select("id,role,status").eq("auth_user_id",user.id).maybeSingle();
  if(!member||String(member.role||"").toLowerCase()!=="owner"||String(member.status||"").toLowerCase()!=="active")return J({ok:false,error:"Owner access required"},403);

  const body=await req.json().catch(()=>({}));
  const customerId=String(body?.customer_id||"").replace(/\D/g,"");
  if(!/^\d{1,20}$/.test(customerId))return J({ok:false,error:"Invalid Google Ads customer ID"},400);

  const {data:conn,error:connErr}=await db.from("google_ads_connections").select("id,status").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(connErr||!conn?.id)return J({ok:false,error:"Google Ads connection not found"},409);

  const {data:acct,error:acctErr}=await db.from("google_ads_accounts").select("customer_id").eq("connection_id",conn.id).eq("customer_id",customerId).maybeSingle();
  if(acctErr||!acct)return J({ok:false,error:"Choose an account discovered for this connection"},409);

  const {data:selected,error:selectErr}=await db.rpc("select_google_ads_account_server",{p_connection_id:conn.id,p_customer_id:customerId});
  if(selectErr)return J({ok:false,error:"Could not select Google Ads account"},500);

  await db.from("ai_actions").insert({id:crypto.randomUUID(),created_by_team_id:member.id,model_provider:"system",tool:"google_ads_select_account",domain:"google_ads",requested_action:{customer_id:customerId},approval_status:"not_required",success:true,api_result:{ok:true,read_only:true,external_mutation:false}});
  return J({ok:true,read_only:true,external_mutation:false,selection:selected});
});