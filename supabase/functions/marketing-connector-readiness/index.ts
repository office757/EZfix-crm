import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const H={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json",
};
const J=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:H});
const present=(name:string)=>Boolean(String(Deno.env.get(name)||"").trim());

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:H});
  if(req.method!=="POST") return J({ok:false,error:"Method not allowed"},405);

  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) return J({ok:false,error:"Unauthorized"},401);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!anon||!service) return J({ok:false,error:"Server environment incomplete"},500);

  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user) return J({ok:false,error:"Unauthorized"},401);

  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member,error:memberError}=await db.from("team").select("id,role,status").eq("auth_user_id",user.id).maybeSingle();
  if(memberError||!member||String(member.role||"").toLowerCase()!=="owner"||String(member.status||"").toLowerCase()!=="active"){
    return J({ok:false,error:"Owner access required"},403);
  }

  const googleClientId=present("GOOGLE_OAUTH_CLIENT_ID");
  const googleClientSecret=present("GOOGLE_OAUTH_CLIENT_SECRET");
  const googleAdsDeveloperToken=present("GOOGLE_ADS_DEVELOPER_TOKEN");
  const metaAppId=present("META_APP_ID");
  const metaAppSecret=present("META_APP_SECRET");

  const [{count:googleConnections,error:googleError},{data:channels,error:channelError}]=await Promise.all([
    db.from("google_ads_connections").select("id",{count:"exact",head:true}),
    db.from("marketing_channels").select("id,connection_status,capabilities").order("id"),
  ]);
  if(googleError||channelError) return J({ok:false,error:"Could not load connector state"},500);

  const byId=Object.fromEntries((channels||[]).map((x:any)=>[x.id,x]));
  return J({
    ok:true,
    read_only:true,
    secrets_exposed:false,
    connectors:{
      google_ads:{
        oauth_client_id_configured:googleClientId,
        oauth_client_secret_configured:googleClientSecret,
        developer_token_configured:googleAdsDeveloperToken,
        developer_token_required:false,
        oauth_ready:googleClientId&&googleClientSecret,
        api_ready:googleClientId&&googleClientSecret,
        connected:Number(googleConnections||0)>0,
        connection_status:byId.google_ads?.connection_status||"not_connected",
        write_enabled:false,
        scope:"https://www.googleapis.com/auth/adwords",
      },
      google_business_profile:{
        oauth_client_id_configured:googleClientId,
        oauth_client_secret_configured:googleClientSecret,
        oauth_ready:googleClientId&&googleClientSecret,
        connected:byId.google_business_profile?.connection_status==="connected",
        connection_status:byId.google_business_profile?.connection_status||"not_connected",
        publish_enabled:false,
        project_api_approval_required:true,
        scope:"https://www.googleapis.com/auth/business.manage",
      },
      meta:{
        app_id_configured:metaAppId,
        app_secret_configured:metaAppSecret,
        oauth_ready:metaAppId&&metaAppSecret,
        facebook_connected:byId.facebook?.connection_status==="connected",
        instagram_connected:byId.instagram?.connection_status==="connected",
        publish_enabled:false,
      },
      website:{
        connected:byId.website?.connection_status==="inbound_connected",
        connection_status:byId.website?.connection_status||"not_connected",
        lead_capture:Boolean(byId.website?.capabilities?.lead_capture),
        publish_enabled:false,
      }
    }
  });
});
