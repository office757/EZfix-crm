import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const J=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const URL=Deno.env.get("SUPABASE_URL")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const API_VERSION=String(Deno.env.get("GOOGLE_ADS_API_VERSION")||"v25").replace(/^\/+|\/+$/g,"");

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:H});
  if(req.method!=="POST") return J({ok:false,error:"Method not allowed"},405);
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) return J({ok:false,error:"Unauthorized"},401);
  if(!URL||!ANON||!SERVICE) return J({ok:false,error:"Server environment incomplete"},500);

  const uc=createClient(URL,ANON,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await uc.auth.getUser();
  if(!user) return J({ok:false,error:"Unauthorized"},401);

  const db=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member}=await db.from("team").select("id,role,status").eq("auth_user_id",user.id).maybeSingle();
  if(!member||String(member.role||"").toLowerCase()!=="owner"||String(member.status||"").toLowerCase()!=="active") return J({ok:false,error:"Owner access required"},403);

  const clientId=String(Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")||"").trim();
  const clientSecret=String(Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")||"").trim();
  const developerToken=String(Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")||"").trim();
  if(!clientId||!clientSecret||!developerToken) return J({ok:false,error:"Google Ads API credentials are incomplete",code:"CREDENTIALS_MISSING"},409);

  const {data:oauthConn,error:oauthErr}=await db.from("marketing_oauth_connections")
    .select("credential_ref,status").eq("provider","google_ads").maybeSingle();
  if(oauthErr||!oauthConn?.credential_ref||oauthConn.status!=="connected") return J({ok:false,error:"Google Ads OAuth connection is not ready",code:"OAUTH_REQUIRED"},409);

  const {data:secret,error:secretErr}=await db.rpc("get_marketing_oauth_secret",{p_ref:oauthConn.credential_ref});
  if(secretErr||!secret) return J({ok:false,error:"Stored Google Ads credential is unavailable"},500);
  let refreshToken="";
  try{refreshToken=String(JSON.parse(String(secret))?.refresh_token||"").trim()}catch{}
  if(!refreshToken) return J({ok:false,error:"Stored Google Ads refresh token is invalid"},500);

  const tokenForm=new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"});
  const tokenRes=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:tokenForm});
  const tokenJson=await tokenRes.json().catch(()=>({}));
  if(!tokenRes.ok||!tokenJson?.access_token){
    const message=String(tokenJson?.error_description||tokenJson?.error||"Could not refresh Google access token");
    await db.from("marketing_oauth_connections").update({status:"error",last_error:message,updated_at:new Date().toISOString()}).eq("provider","google_ads");
    return J({ok:false,error:message},502);
  }

  const accessToken=String(tokenJson.access_token);
  const listRes=await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`,{
    headers:{Authorization:`Bearer ${accessToken}`,"developer-token":developerToken,"Content-Type":"application/json"}
  });
  const listJson=await listRes.json().catch(()=>({}));
  if(!listRes.ok){
    const message=String(listJson?.error?.message||"Could not list accessible Google Ads customers");
    await db.from("marketing_oauth_connections").update({last_error:message,updated_at:new Date().toISOString()}).eq("provider","google_ads");
    return J({ok:false,error:message,http_status:listRes.status},502);
  }

  const ids=(Array.isArray(listJson?.resourceNames)?listJson.resourceNames:[])
    .map((x:string)=>String(x).replace(/^customers\//,"").replace(/\D/g,""))
    .filter((x:string)=>/^\d+$/.test(x));

  const {data:adsConn,error:adsConnErr}=await db.from("google_ads_connections")
    .select("id").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(adsConnErr||!adsConn?.id) return J({ok:false,error:"Google Ads CRM connection row is missing"},500);

  if(ids.length){
    const rows=ids.map((customerId:string)=>({connection_id:adsConn.id,customer_id:customerId,selected:false,updated_at:new Date().toISOString()}));
    const {error:upsertErr}=await db.from("google_ads_accounts").upsert(rows,{onConflict:"connection_id,customer_id"});
    if(upsertErr) return J({ok:false,error:"Could not store Google Ads account list"},500);
  }

  const now=new Date().toISOString();
  await db.from("google_ads_connections").update({status:"connected",last_error:null,last_synced_at:now,updated_at:now}).eq("id",adsConn.id);
  await db.from("marketing_oauth_connections").update({status:"connected",last_error:null,updated_at:now}).eq("provider","google_ads");
  await db.from("marketing_channels").update({connection_status:"connected",last_synced_at:now,updated_at:now}).eq("id","google_ads");

  return J({ok:true,read_only:true,write_enabled:false,api_version:API_VERSION,account_count:ids.length,customer_ids:ids});
});