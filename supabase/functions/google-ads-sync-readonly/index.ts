import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const J=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const URL=Deno.env.get("SUPABASE_URL")||"",ANON=Deno.env.get("SUPABASE_ANON_KEY")||"",SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const API_VERSION=String(Deno.env.get("GOOGLE_ADS_API_VERSION")||"v25").replace(/^\/+|\/+$/g,"");
const n=(v:unknown)=>Number(v)||0;
const rowsFromStream=(payload:any)=>Array.isArray(payload)?payload.flatMap((x:any)=>Array.isArray(x?.results)?x.results:[]):[];

async function googleStream(customerId:string,accessToken:string,loginCustomerId:string,developerToken:string,query:string){
  const headers:any={Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"};
  if(loginCustomerId)headers["login-customer-id"]=loginCustomerId;
  headers["developer-token"]=developerToken;
  const r=await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`,{method:"POST",headers,body:JSON.stringify({query})});
  const body=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(String(body?.error?.message||`Google Ads query failed (${r.status})`));
  return rowsFromStream(body);
}

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

  const clientId=String(Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")||"").trim();
  const clientSecret=String(Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")||"").trim();
  const developerToken=String(Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")||"").trim();
  if(!clientId||!clientSecret||!developerToken)return J({ok:false,error:"Google Ads API credentials are incomplete",code:"CREDENTIALS_MISSING"},409);

  const {data:conn,error:connErr}=await db.from("google_ads_connections").select("id,selected_customer_id,login_customer_id,credential_ref,status").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(connErr||!conn?.id||!conn.selected_customer_id||!conn.credential_ref)return J({ok:false,error:"Select a Google Ads account before syncing",code:"ACCOUNT_SELECTION_REQUIRED"},409);

  const customerId=String(conn.selected_customer_id).replace(/\D/g,"");
  const loginCustomerId=String(conn.login_customer_id||"").replace(/\D/g,"");
  const {data:secret,error:secretErr}=await db.rpc("get_marketing_oauth_secret",{p_ref:conn.credential_ref});
  if(secretErr||!secret)return J({ok:false,error:"Stored Google Ads credential is unavailable"},500);
  let refreshToken="";try{refreshToken=String(JSON.parse(String(secret))?.refresh_token||"").trim()}catch{}
  if(!refreshToken)return J({ok:false,error:"Stored Google Ads refresh token is invalid"},500);

  const tokenForm=new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"});
  const tokenRes=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:tokenForm});
  const tokenJson=await tokenRes.json().catch(()=>({}));
  if(!tokenRes.ok||!tokenJson?.access_token)return J({ok:false,error:String(tokenJson?.error_description||tokenJson?.error||"Could not refresh Google access token")},502);
  const accessToken=String(tokenJson.access_token);

  const {data:run,error:runErr}=await db.from("marketing_sync_runs").insert({channel_id:"google_ads",sync_type:"read_only_reporting",status:"running",metadata:{customer_id:customerId,api_version:API_VERSION,write_enabled:false}}).select("id").single();
  if(runErr)return J({ok:false,error:"Could not start sync audit"},500);
  const started=new Date().toISOString();

  try{
    await db.from("google_ads_sync_state").upsert({connection_id:conn.id,resource_type:"campaigns_and_metrics",status:"running",last_run_at:started,last_error:null},{onConflict:"connection_id,resource_type"});

    const campaignQuery=`SELECT campaign.id,campaign.name,campaign.status,campaign.advertising_channel_type,campaign.bidding_strategy_type,campaign.start_date,campaign.end_date,campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'`;
    const metricsQuery=`SELECT campaign.id,segments.date,metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.interactions FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'`;

    const [campaignRows,metricRows]=await Promise.all([
      googleStream(customerId,accessToken,loginCustomerId,developerToken,campaignQuery),
      googleStream(customerId,accessToken,loginCustomerId,developerToken,metricsQuery)
    ]);
    const now=new Date().toISOString();

    const snapshots=campaignRows.map((r:any)=>({
      connection_id:conn.id,customer_id:customerId,campaign_id:String(r?.campaign?.id||""),
      name:r?.campaign?.name||null,status:r?.campaign?.status||null,
      advertising_channel_type:r?.campaign?.advertisingChannelType||null,
      bidding_strategy_type:r?.campaign?.biddingStrategyType||null,
      budget_micros:r?.campaignBudget?.amountMicros==null?null:Number(r.campaignBudget.amountMicros),
      start_date:r?.campaign?.startDate||null,end_date:r?.campaign?.endDate||null,
      serving_status:r?.campaign?.status||null,source_payload:r,synced_at:now
    })).filter((x:any)=>/^\d+$/.test(x.campaign_id));

    const metrics=metricRows.map((r:any)=>({
      connection_id:conn.id,customer_id:customerId,campaign_id:String(r?.campaign?.id||""),
      metric_date:String(r?.segments?.date||""),impressions:n(r?.metrics?.impressions),clicks:n(r?.metrics?.clicks),
      cost_micros:n(r?.metrics?.costMicros),conversions:n(r?.metrics?.conversions),
      conversions_value:n(r?.metrics?.conversionsValue),interactions:n(r?.metrics?.interactions),
      source_payload:r,synced_at:now
    })).filter((x:any)=>/^\d+$/.test(x.campaign_id)&&/^\d{4}-\d{2}-\d{2}$/.test(x.metric_date));

    if(snapshots.length){const {error}=await db.from("google_ads_campaign_snapshots").upsert(snapshots,{onConflict:"connection_id,customer_id,campaign_id"});if(error)throw error;}
    if(metrics.length){const {error}=await db.from("google_ads_daily_metrics").upsert(metrics,{onConflict:"connection_id,customer_id,campaign_id,metric_date"});if(error)throw error;}

    const through=metrics.reduce((m:any,x:any)=>!m||x.metric_date>m?x.metric_date:m,null);
    await db.from("google_ads_sync_state").upsert({connection_id:conn.id,resource_type:"campaigns_and_metrics",synced_through:through,last_run_at:now,status:"success",last_error:null},{onConflict:"connection_id,resource_type"});
    await db.from("google_ads_connections").update({status:"connected",last_synced_at:now,last_error:null,updated_at:now}).eq("id",conn.id);
    await db.from("marketing_channels").update({connection_status:"connected",last_synced_at:now,updated_at:now}).eq("id","google_ads");
    await db.from("marketing_sync_runs").update({status:"success",completed_at:now,records_read:campaignRows.length+metricRows.length,records_written:snapshots.length+metrics.length}).eq("id",run.id);

    return J({ok:true,read_only:true,write_enabled:false,external_mutation:false,customer_id:customerId,campaigns:snapshots.length,daily_metric_rows:metrics.length,synced_through:through});
  }catch(e:any){
    const msg=String(e?.message||e||"Google Ads read-only sync failed").slice(0,1000),now=new Date().toISOString();
    await db.from("google_ads_sync_state").upsert({connection_id:conn.id,resource_type:"campaigns_and_metrics",last_run_at:now,status:"error",last_error:msg},{onConflict:"connection_id,resource_type"});
    await db.from("google_ads_connections").update({last_error:msg,updated_at:now}).eq("id",conn.id);
    await db.from("marketing_sync_runs").update({status:"error",completed_at:now,error_summary:msg}).eq("id",run.id);
    return J({ok:false,read_only:true,error:msg},502);
  }
});