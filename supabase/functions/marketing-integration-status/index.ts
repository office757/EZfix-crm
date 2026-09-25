import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Content-Type":"application/json"};
const J=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const URL=Deno.env.get("SUPABASE_URL")!,ANON=Deno.env.get("SUPABASE_ANON_KEY")!,SR=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:H});
  if(!["GET","POST"].includes(req.method)) return J({ok:false,error:"Method not allowed"},405);
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) return J({ok:false,error:"Unauthorized"},401);
  const uc=createClient(URL,ANON,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:userErr}=await uc.auth.getUser();
  if(userErr||!user) return J({ok:false,error:"Unauthorized"},401);
  const db=createClient(URL,SR,{auth:{persistSession:false}});
  const {data:member,error:memberErr}=await db.from("team").select("id,role,status").eq("auth_user_id",user.id).maybeSingle();
  if(memberErr||!member||member.role!=="owner"||member.status!=="active") return J({ok:false,error:"Owner access required"},403);
  try{
    const [channels,oauth,gConn,gAcct]=await Promise.all([
      db.from("marketing_channels").select("id,name,channel_type,connection_status,capabilities,public_config,last_synced_at,updated_at").order("channel_type"),
      db.from("marketing_oauth_connections").select("provider,status,credential_ref,granted_scopes,account_meta,token_expires_at,connected_at,last_error,updated_at").order("provider"),
      db.from("google_ads_connections").select("id",{count:"exact",head:true}),
      db.from("google_ads_accounts").select("id",{count:"exact",head:true})
    ]);
    for(const r of [channels,oauth,gConn,gAcct]) if(r.error) throw r.error;
    const connections=(oauth.data||[]).map((x:any)=>({...x,credential_configured:!!x.credential_ref,credential_ref:undefined}));
    const result={mode:"read_only",publishing_enabled:false,channels:channels.data||[],oauth_connections:connections,google_ads:{connections:gConn.count||0,accounts:gAcct.count||0}};
    await db.from("ai_actions").insert({id:crypto.randomUUID(),created_by_team_id:member.id,model_provider:"system",tool:"marketing_integration_status",domain:"marketing",requested_action:{mode:"read_only"},approval_status:"not_required",success:true,api_result:{ok:true,read_only:true}});
    return J({ok:true,...result});
  }catch(e:any){
    console.error("marketing-integration-status",e);
    return J({ok:false,error:"Could not load integration status"},500);
  }
});