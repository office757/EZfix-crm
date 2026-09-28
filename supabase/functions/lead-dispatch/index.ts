import { createClient } from "npm:@supabase/supabase-js@2.99.2";
import { pushConfig, notifyLeadOffer } from "../_shared/lead-offer-notifications.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const out=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return out({ok:false,error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const authorization=req.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer '))return out({ok:false,error:'Sign in required'},401);
 const scoped=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const {data:{user},error:authError}=await scoped.auth.getUser(authorization.slice(7));
 if(authError||!user)return out({ok:false,error:'Sign in required'},401);
 const db=createClient(url,service,{auth:{persistSession:false}});
 const {data:member}=await db.from('team').select('id,role').eq('auth_user_id',user.id).eq('status','active').maybeSingle();
 if(!member)return out({ok:false,error:'Active account required'},403);
 const body=await req.json().catch(()=>null);
 try{
  if(body?.action==='public_key'){const config=await pushConfig(db);return out({ok:true,public_key:config.public_key});}
  if(!['owner','admin','dispatcher','office'].includes(member.role))return out({ok:false,error:'Office access required'},403);
  if(!['offer','offer_job'].includes(body?.action))return out({ok:false,error:'Unsupported action'},400);
  const {data:offer,error}=await scoped.rpc(body.action==='offer_job'?'offer_job_technician':'create_lead_offer',body.action==='offer_job'?{p_job_id:String(body.job_id||''),p_technician_id:String(body.technician_id||''),p_expected_technician_id:body.expected_technician_id||null}:{p_lead_id:String(body.lead_id||''),p_technician_id:String(body.technician_id||'')});
  if(error)return out({ok:false,error:error.message},409);
  const notification=await notifyLeadOffer(db,offer);
  return out({ok:true,offer_id:offer.id,notification});
 }catch(e){console.error('lead dispatch failed',e?.message);return out({ok:false,error:'Dispatch could not be completed. Refresh Leads before trying again.'},500);}
});
