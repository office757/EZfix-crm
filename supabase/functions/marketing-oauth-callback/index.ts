import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const CALLBACK=`${SUPABASE_URL}/functions/v1/marketing-oauth-callback`;
const CRM_RETURN="https://ezfix-crm-sms-length-fixed.vercel.app/";
const ALLOWED_PROVIDERS=new Set(["google_ads","google_business_profile"]);
const sha256Hex=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("");
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
const safeReturnTo=(value:unknown)=>{try{const u=new URL(String(value||""));return u.origin===new URL(CRM_RETURN).origin?u.toString():CRM_RETURN;}catch{return CRM_RETURN;}};
const page=(title:string,msg:string,returnTo:string,status=200)=>new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><body style="font-family:Arial,sans-serif;background:#f6f4ef;color:#17181a;padding:32px"><main style="max-width:620px;margin:auto;background:white;padding:28px;border-radius:16px"><h2>${esc(title)}</h2><p>${esc(msg)}</p><a href="${esc(returnTo)}" style="display:inline-block;margin-top:14px;padding:12px 18px;background:#f7941d;color:#111;text-decoration:none;border-radius:8px;font-weight:700">Return to EZfix CRM</a></main></body>`,{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});

Deno.serve(async(req:Request)=>{
  if(req.method!=="GET") return page("OAuth failed","Method not allowed.",CRM_RETURN,405);
  const u=new URL(req.url);
  const state=String(u.searchParams.get("state")||"").trim();
  const code=String(u.searchParams.get("code")||"").trim();
  const oauthError=String(u.searchParams.get("error")||"").trim().slice(0,200);
  if(!SUPABASE_URL||!SERVICE) return page("OAuth unavailable","Server environment is incomplete.",CRM_RETURN,500);
  if(!/^[A-Za-z0-9_-]{40,100}$/.test(state)) return page("OAuth failed","Invalid state parameter.",CRM_RETURN,400);
  if(code.length>4096) return page("OAuth failed","Invalid authorization code.",CRM_RETURN,400);

  const db=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
  const hash=await sha256Hex(state);
  const nowIso=new Date().toISOString();
  const {data:st,error:stateError}=await db.from("marketing_oauth_states").select("*").eq("state_hash",hash).is("consumed_at",null).gt("expires_at",nowIso).maybeSingle();
  if(stateError||!st||!ALLOWED_PROVIDERS.has(String(st.provider||""))) return page("OAuth failed","The connection request is invalid or expired.",CRM_RETURN,400);
  if(String(st.redirect_uri||"")!==CALLBACK) return page("OAuth failed","The connection request does not match this callback.",CRM_RETURN,400);
  const returnTo=safeReturnTo(st.return_to);

  const claimAt=new Date().toISOString();
  const {data:claimed,error:claimError}=await db.from("marketing_oauth_states")
    .update({consumed_at:claimAt,code_verifier:"consumed"})
    .eq("id",st.id).is("consumed_at",null).gt("expires_at",claimAt)
    .select("id").maybeSingle();
  if(claimError||!claimed) return page("OAuth failed","The connection request was already used or expired.",CRM_RETURN,400);
  if(oauthError) return page("Connection cancelled",`Google returned: ${oauthError}`,returnTo,400);
  if(!code) return page("OAuth failed","Missing authorization code.",returnTo,400);

  const clientId=String(Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")||"").trim();
  const clientSecret=String(Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")||"").trim();
  if(!clientId||!clientSecret) return page("OAuth failed","Google OAuth credentials are not configured.",returnTo,500);

  const form=new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:CALLBACK,grant_type:"authorization_code",code_verifier:String(st.code_verifier||"")});
  const tokenRes=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
  const token=await tokenRes.json().catch(()=>({}));
  if(!tokenRes.ok){
    await db.from("marketing_oauth_connections").upsert({provider:st.provider,status:"error",last_error:String(token?.error_description||token?.error||"Token exchange failed"),updated_at:new Date().toISOString()},{onConflict:"provider"});
    return page("OAuth failed",String(token?.error_description||token?.error||"Token exchange failed"),returnTo,502);
  }
  let refreshToken=String(token?.refresh_token||"").trim();
  if(!refreshToken){
    const {data:existing}=await db.from("marketing_oauth_connections").select("credential_ref").eq("provider",st.provider).maybeSingle();
    if(existing?.credential_ref){
      const {data:stored}=await db.rpc("get_marketing_oauth_secret",{p_ref:existing.credential_ref});
      try{refreshToken=String(JSON.parse(String(stored||"{}"))?.refresh_token||"")}catch{refreshToken=""}
    }
  }
  if(!refreshToken) return page("OAuth failed","Google did not return a refresh token. Reconnect with consent enabled.",returnTo,409);

  const secretPayload=JSON.stringify({refresh_token:refreshToken,scope:String(token?.scope||""),token_type:String(token?.token_type||"Bearer")});
  const secretName=`ezfix_oauth_${st.provider}`;
  const {data:secretRef,error:secretError}=await db.rpc("store_marketing_oauth_secret",{p_name:secretName,p_secret:secretPayload});
  if(secretError||!secretRef) return page("OAuth failed","Could not store the OAuth credential securely.",returnTo,500);

  const now=new Date(),expiresIn=Number(token?.expires_in||3600),expiresAt=new Date(now.getTime()+Math.max(60,expiresIn)*1000).toISOString();
  const scopes=String(token?.scope||"").split(/\s+/).filter(Boolean);
  const {error:connError}=await db.from("marketing_oauth_connections").upsert({provider:st.provider,status:"connected",credential_ref:String(secretRef),granted_scopes:scopes,token_expires_at:expiresAt,connected_at:now.toISOString(),last_error:null,updated_at:now.toISOString()},{onConflict:"provider"});
  if(connError) return page("OAuth failed","Could not save connection metadata.",returnTo,500);

  if(st.provider==="google_ads"){
    const {data:existingAds}=await db.from("google_ads_connections").select("id").order("created_at",{ascending:false}).limit(1).maybeSingle();
    const adsPatch={status:"connected_pending_account_selection",credential_ref:String(secretRef),token_expires_at:expiresAt,last_error:null,updated_at:now.toISOString()};
    const adsWrite=existingAds?.id?await db.from("google_ads_connections").update(adsPatch).eq("id",existingAds.id):await db.from("google_ads_connections").insert(adsPatch);
    if(adsWrite.error) return page("OAuth failed","Could not save Google Ads connection metadata.",returnTo,500);
    await db.from("marketing_channels").update({connection_status:"oauth_connected",updated_at:now.toISOString()}).eq("id","google_ads");
  } else if(st.provider==="google_business_profile"){
    await db.from("marketing_channels").update({connection_status:"oauth_connected",updated_at:now.toISOString()}).eq("id","google_business_profile");
  }

  return page("Connection authorized",st.provider==="google_ads"?"Google Ads authorization is connected. Account selection and read-only sync can be completed next.":"Google Business Profile authorization is connected. Account/location selection can be completed next.",returnTo,200);
});
