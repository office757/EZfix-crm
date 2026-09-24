import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const J=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const CALLBACK=`${SUPABASE_URL}/functions/v1/marketing-oauth-callback`;
const CRM_RETURN="https://ezfix-crm-sms-length-fixed.vercel.app/";
const GOOGLE_AUTH="https://accounts.google.com/o/oauth2/v2/auth";

const bytesToBase64Url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const randomToken=(bytes=32)=>bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256Bytes=async(s:string)=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));
const sha256Hex=async(s:string)=>Array.from(await sha256Bytes(s)).map(b=>b.toString(16).padStart(2,"0")).join("");

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:H});
  if(req.method!=="POST") return J({ok:false,error:"Method not allowed"},405);
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) return J({ok:false,error:"Unauthorized"},401);
  if(!SUPABASE_URL||!ANON||!SERVICE) return J({ok:false,error:"Server environment incomplete"},500);

  const uc=createClient(SUPABASE_URL,ANON,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await uc.auth.getUser();
  if(!user) return J({ok:false,error:"Unauthorized"},401);

  const db=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member}=await db.from("team").select("id,role,status").eq("auth_user_id",user.id).maybeSingle();
  if(!member||String(member.role||"").toLowerCase()!=="owner"||String(member.status||"").toLowerCase()!=="active") return J({ok:false,error:"Owner access required"},403);

  const body=await req.json().catch(()=>({}));
  const provider=String(body?.provider||"").trim();
  if(!["google_ads","google_business_profile"].includes(provider)) return J({ok:false,error:"Unsupported OAuth provider"},400);

  const clientId=String(Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")||"").trim();
  const clientSecret=String(Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")||"").trim();
  if(!clientId||!clientSecret) return J({ok:false,error:"Google OAuth credentials are not configured",code:"CREDENTIALS_MISSING"},409);

  const state=randomToken(32);
  const verifier=randomToken(48);
  const challenge=bytesToBase64Url(await sha256Bytes(verifier));
  const scope=provider==="google_ads"?"https://www.googleapis.com/auth/adwords":"https://www.googleapis.com/auth/business.manage";
  const expiresAt=new Date(Date.now()+10*60*1000).toISOString();

  await db.from("marketing_oauth_states").delete().lt("expires_at",new Date().toISOString());
  const {error:insertError}=await db.from("marketing_oauth_states").insert({
    provider,
    state_hash:await sha256Hex(state),
    code_verifier:verifier,
    redirect_uri:CALLBACK,
    requested_scopes:[scope],
    created_by_team_id:member.id,
    return_to:CRM_RETURN,
    expires_at:expiresAt
  });
  if(insertError) return J({ok:false,error:"Could not create OAuth state"},500);

  const u=new URL(GOOGLE_AUTH);
  u.searchParams.set("client_id",clientId);
  u.searchParams.set("redirect_uri",CALLBACK);
  u.searchParams.set("response_type","code");
  u.searchParams.set("scope",scope);
  u.searchParams.set("access_type","offline");
  u.searchParams.set("include_granted_scopes","true");
  u.searchParams.set("prompt","consent");
  u.searchParams.set("state",state);
  u.searchParams.set("code_challenge",challenge);
  u.searchParams.set("code_challenge_method","S256");

  return J({ok:true,provider,authorization_url:u.toString(),expires_at:expiresAt,write_enabled:false});
});
