import { createClient } from "npm:@supabase/supabase-js@2.99.2";
import webpush from "npm:web-push@3.6.7";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const out=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
// Push endpoints are user-supplied. Never use them as arbitrary server fetch targets.
export function allowedPushEndpoint(value:string){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&((u.hostname==='fcm.googleapis.com'&&u.pathname.startsWith('/fcm/send/'))||(u.hostname==='updates.push.services.mozilla.com'&&u.pathname.startsWith('/wpush/'))||(u.hostname==='web.push.apple.com'&&u.pathname.startsWith('/')));}catch{return false;}
}
async function pushConfig(db:any){
 let {data,error}=await db.rpc('service_push_config');if(error)throw error;
 if(!data){const keys=webpush.generateVAPIDKeys();const saved=await db.rpc('service_init_push_config',{p_public_key:keys.publicKey,p_private_key:keys.privateKey});if(saved.error)throw saved.error;const loaded=await db.rpc('service_push_config');if(loaded.error)throw loaded.error;data=loaded.data;}
 if(!data?.public_key||!data?.private_key)throw new Error('Push configuration unavailable');return data;
}
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
  if(body?.action!=='offer')return out({ok:false,error:'Unsupported action'},400);
  const {data:offer,error}=await scoped.rpc('create_lead_offer',{p_lead_id:String(body.lead_id||''),p_technician_id:String(body.technician_id||'')});
  if(error)return out({ok:false,error:error.message},409);
  const {data:claimed,error:claimError}=await db.rpc('service_claim_offer_notification',{p_offer_id:offer.id});
  if(claimError||!claimed)return out({ok:true,offer_id:offer.id,notification:{state:'unconfirmed'}});
  const notification:any={state:'complete',in_app:{status:'created'},push:{status:'no_subscription',accepted:0},whatsapp:{status:'not_configured'}};
  const text=`EZfix: New lead — ZIP ${offer.zip}. Respond within 5 minutes. Open Leads in the EZfix app to accept.`;
  try{
   const {data:subs,error:subError}=await db.from('push_subscriptions').select('id,endpoint,subscription').eq('team_id',offer.technician_id).limit(20);
   if(subError)throw subError;
   if(subs?.length){
    const config=await pushConfig(db);let accepted=0,failed=0;
    const results=await Promise.allSettled(subs.map(async(s:any)=>{
     if(!allowedPushEndpoint(s.endpoint)||s.subscription?.endpoint!==s.endpoint){failed++;return;}
     try{await webpush.sendNotification(s.subscription,JSON.stringify({title:'New lead · ZIP '+offer.zip,body:'You have five minutes to accept this lead.',offer_id:offer.id,expires_at:offer.expires_at}),{TTL:Math.max(0,Math.ceil((Date.parse(offer.expires_at)-Date.now())/1000)),urgency:'high',timeout:6000,vapidDetails:{subject:'mailto:office@ezfixgaragedoorsinc.com',publicKey:config.public_key,privateKey:config.private_key}});accepted++;}
     catch(e){failed++;if([404,410].includes(Number(e?.statusCode)))await db.from('push_subscriptions').delete().eq('id',s.id);}
    }));
    notification.push={status:accepted?'accepted':'failed',accepted,failed:failed+results.filter(r=>r.status==='rejected').length};
   }
  }catch{notification.push={status:'failed',accepted:0};}
  try{
   const notificationId='offer_'+offer.id;
   const {error:waError}=await db.from('wa_notifications').insert({id:notificationId,recipient_team_id:offer.technician_id,kind:'newLead',entity_type:'lead_offers',entity_id:offer.id,message:text,status:'pending'});
   if(waError)throw waError;
   const response=await fetch(url+'/functions/v1/send-whatsapp-notification',{method:'POST',headers:{authorization,apikey:anon,'content-type':'application/json'},body:JSON.stringify({action:'send',notification_id:notificationId}),signal:AbortSignal.timeout(12000)});
   const wa=await response.json().catch(()=>({}));notification.whatsapp={status:String(wa.status||(response.ok?'unconfirmed':'failed'))};
  }catch{notification.whatsapp={status:'unconfirmed'};}
  const {error:saveError}=await db.from('lead_offers').update({notification_status:notification}).eq('id',offer.id);
  return out({ok:true,offer_id:offer.id,notification,notification_saved:!saveError});
 }catch(e){console.error('lead dispatch failed',e?.message);return out({ok:false,error:'Dispatch could not be completed. Refresh Leads before trying again.'},500);}
});
