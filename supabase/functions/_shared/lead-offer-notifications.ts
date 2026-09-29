import { Inkbox } from "npm:@inkbox/sdk@0.7.8";
import webpush from "npm:web-push@3.6.7";
// Push endpoints are user-supplied. Never use them as arbitrary server fetch targets.
export function allowedPushEndpoint(value:string){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&((u.hostname==='fcm.googleapis.com'&&u.pathname.startsWith('/fcm/send/'))||(u.hostname==='updates.push.services.mozilla.com'&&u.pathname.startsWith('/wpush/'))||(u.hostname==='web.push.apple.com'&&u.pathname.startsWith('/')));}catch{return false;}
}
export async function pushConfig(db:any){
 let {data,error}=await db.rpc('service_push_config');if(error)throw error;
 if(!data){const keys=webpush.generateVAPIDKeys();const saved=await db.rpc('service_init_push_config',{p_public_key:keys.publicKey,p_private_key:keys.privateKey});if(saved.error)throw saved.error;const loaded=await db.rpc('service_push_config');if(loaded.error)throw loaded.error;data=loaded.data;}
 if(!data?.public_key||!data?.private_key)throw new Error('Push configuration unavailable');return data;
}

const SITE = 'https://ezfix-crm-sms-length-fixed.vercel.app';
const e164 = (v: unknown) => {const d=String(v||'').replace(/\D/g,'');return /^1\d{10}$/.test(d)?'+'+d:/^\d{10}$/.test(d)?'+1'+d:'';};
async function tokenPair(){
 const raw=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 return {raw,hash};
}
// Store only bounded diagnostics: SDK errors may contain phone numbers or tokens.
export function smsFailure(error:any,stage:string){
 const http=Number(error?.statusCode);
 const rejected=stage==='identity'||(stage==='send'&&[400,401,402,403,404,405,422,429].includes(http));
 const kind=error?.name==='RecipientBlockedError'?'recipient_blocked':error?.name==='InkboxConnectionError'?'connection_error':error?.name==='AbortError'||error?.name==='TimeoutError'?'timeout':'provider_error';
 const code=Number.isInteger(http)&&http>=400&&http<=599?` HTTP ${http}`:'';
 return {status:rejected?'failed':'unconfirmed',reason:`SMS ${stage}: ${kind}${code}. ${rejected?'Not accepted by provider.':'Provider outcome unknown. Do not resend automatically.'}`};
}
export async function notifyLeadOffer(db:any,offer:any,options:any={}){
 const {data:claimed,error:claimError}=await db.rpc('service_claim_offer_notification',{p_offer_id:offer.id});
 if(claimError||!claimed)return {state:'unconfirmed',in_app:{status:'created'}};
 const notification:any={state:'complete',in_app:{status:'created'}};
 const [smsToken,waToken]=await Promise.all([tokenPair(),tokenPair()]);
 const issued=await db.rpc('service_issue_lead_offer_tokens',{p_offer_id:offer.id,p_sms_hash:smsToken.hash,p_whatsapp_hash:waToken.hash});
 const linksReady=!issued.error&&issued.data===true;
 const {data:tech}=await db.from('team').select('id,phone,status,app_data').eq('id',offer.technician_id).maybeSingle();
 const demo=options.demoRun;
 if(demo&&(!demo.enabled||Date.parse(demo.expires_at)<=Date.now()||!demo.technician_ids.includes(offer.technician_id)||!demo.lead_ids.includes(offer.lead_id)||tech?.app_data?.demo_batch!==demo.batch_id||tech?.app_data?.whatsapp_number!==demo.recipient_phone||tech?.app_data?.demo_contact_owner_confirmed!==true))return {state:'blocked_demo_scope'};
 const intro=demo?`DEMO ${offer.technician_id.split('_').at(-1)} - Ashley test`:offer.routing_source==='ashley'?'Ashley sent you a lead':'EZfix: New lead';
 const message=(token:string)=>`${intro} - ZIP ${offer.zip}. Accept or decline within 5 minutes: ${SITE}/lead-offer#${token} . Approve once in the app, SMS or WhatsApp.`;
 const current=()=>Date.parse(offer.expires_at)>Date.now();
 async function sms(){
  const id='lead_offer_'+offer.id;
  if(!linksReady)return {status:'unavailable'};
  if(!tech||tech.status!=='active')return {status:'unavailable'};
  const to=e164(tech.phone);if(!to)return {status:'invalid_phone'};
  const consent=await db.from('sms_consent').select('status').eq('phone_e164',to).maybeSingle();
  if(consent.error)return {status:'unconfirmed'};
  if(consent.data?.status==='opted_out')return {status:'opted_out'};
  const apiKey=Deno.env.get('INKBOX_API_KEY');if(!apiKey)return {status:'not_configured'};
  if(!current())return {status:'expired'};
  const text=message(smsToken.raw),now=new Date().toISOString();
  // The offer notification claim above prevents repeat sends. Provider identity
  // fields are immutable in sms_messages, so persist them at initial creation.
  const row={id,provider:'inkbox',channel:'sms',direction:'outbound',local_phone_number:'+15083510523',remote_phone_number:to,normalized_remote_phone:to,message_type:'lead_offer',message_text:text,provider_event_ids:['lead_offer:'+offer.id],created_at:now};
  let stage='identity';
  try{
   const identity=await new Inkbox({apiKey,timeoutMs:6000}).getIdentity('ashley-ezfixgaragedoorsinc');
   if(!current())throw new Error('expired');
   stage='send';
   const sent:any=await identity.sendText({to,text});
   stage='persist';
   const at=new Date().toISOString();
   const status=sent.id?(['queued','sent','delivered','failed'].includes(sent.deliveryStatus)?sent.deliveryStatus:'queued'):'delivery_unconfirmed';
   const saved=await db.from('sms_messages').insert({...row,provider_message_id:sent.id||null,provider_conversation_id:sent.conversationId||null,provider_status:status,provider_created_at:sent.createdAt||at,sent_at:sent.id?at:null,delivered_at:status==='delivered'?at:null,failed_at:status==='failed'?at:null,failure_reason:status==='failed'?'Provider reported delivery failure.':null,updated_at:at});
   // A signed provider callback can persist the message before sendText returns.
   // Link its existing delivery record instead of retrying the SMS or losing status.
   if(saved.error?.code==='23505'&&sent.id){
    const existing=await db.from('sms_messages').select('id,provider_status').eq('provider','inkbox').eq('provider_message_id',sent.id).eq('direction','outbound').eq('normalized_remote_phone',to).eq('message_text',text).maybeSingle();
    if(!existing.error&&existing.data?.id)return {status:existing.data.provider_status||'unconfirmed',message_id:existing.data.id};
   }
   return {status:saved.error?'unconfirmed':status,message_id:id};
  }catch(error){
   const failure=smsFailure(error,stage),at=new Date().toISOString();
   console.error('lead_offer_sms',JSON.stringify({offer_id:offer.id,reason:failure.reason}));
   const saved=await db.from('sms_messages').insert({...row,provider_status:failure.status==='failed'?'failed':'delivery_unconfirmed',failure_reason:failure.reason,...(failure.status==='failed'?{failed_at:at}:{}),updated_at:at});
   return {status:saved.error?'unconfirmed':failure.status,message_id:id};
  }
 }
 async function whatsapp(){
  if(!linksReady)return {status:'unavailable'};
  const id='offer_'+offer.id,td=tech?.app_data||{};
  const linked=!!Deno.env.get('WA_LINKED_BRIDGE_KEY');
  let status='queued';
  const to=String(td.whatsapp_number||'').replace(/[^+\d]/g,'');
  const token=Deno.env.get('META_WHATSAPP_TOKEN'),phoneId=Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID'),version=Deno.env.get('META_WHATSAPP_GRAPH_VERSION'),template=Deno.env.get('META_WHATSAPP_ASSIGNMENT_TEMPLATE_NAME');
  if(!tech||tech.status!=='active')status='failed';
  else if(td.notify_prefs?.newLead===false)status='suppressed';
  else if(td.whatsapp_opt_in!==true)status='blocked_no_opt_in';
  else if(!/^\+[1-9]\d{7,14}$/.test(to))status='failed';
  else if(!linked&&(!token||!phoneId||!version||!template))status='not_configured';
  else if(!current())status='suppressed';
  const text=message(waToken.raw);
  const {error}=await db.from('wa_notifications').insert({id,recipient_team_id:offer.technician_id,kind:'newLead',entity_type:'lead_offers',entity_id:offer.id,message:text,status,attempt_count:status==='queued'?1:0,app_data:{status},...(to?{recipient_phone:to}:{})});
  if(error)return {status:'unconfirmed',message_id:id};
  if(status!=='queued')return {status,message_id:id};
  const patch=async(s:string,extra:any={})=>db.from('wa_notifications').update({status:s,app_data:{status:s,...extra},...extra}).eq('id',id);
  if(linked){
   const queued=await db.rpc('service_queue_wa_lead_offer',{p_offer_id:offer.id,p_body:text});
   const state=queued.error?'unconfirmed':queued.data?.status||'unconfirmed';
   await patch(['queued','suppressed','blocked_no_opt_in','not_connected','failed'].includes(state)?state:'failed',{provider:'linked_device',...(state==='unconfirmed'?{failure_reason:'Queue outcome unknown. Do not resend automatically.'}:{})});
   return {status:state,message_id:id,provider:'linked_device'};
  }
  try{
   const response=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:to.slice(1),type:'template',template:{name:template,language:{code:Deno.env.get('META_WHATSAPP_TEMPLATE_LANGUAGE')||'en_US'},components:[{type:'body',parameters:[{type:'text',text}]}]}}),signal:AbortSignal.timeout(8000)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok){await patch('failed',{failure_reason:'WhatsApp provider rejected the lead notification.',failed_at:new Date().toISOString()});return {status:'failed',message_id:id};}
   const providerId=result?.messages?.[0]?.id;
   if(!providerId)throw new Error('unknown');
   const saved=await patch('accepted',{provider:'meta_cloud_api',provider_message_id:String(providerId),accepted_at:new Date().toISOString()});
   return {status:saved.error?'unconfirmed':'accepted',message_id:id};
  }catch{
   await patch('failed',{failure_reason:'Provider outcome unknown. Do not resend automatically.',failed_at:new Date().toISOString()});
   return {status:'unconfirmed',message_id:id};
  }
 }
 async function push(){
  const {data:subs,error}=await db.from('push_subscriptions').select('id,endpoint,subscription').eq('team_id',offer.technician_id).limit(20);
  if(error)throw error;
  if(!subs?.length)return {status:'no_subscription',accepted:0};
  const config=await pushConfig(db);let accepted=0;
  await Promise.allSettled(subs.map(async(s:any)=>{
   if(!allowedPushEndpoint(s.endpoint)||s.subscription?.endpoint!==s.endpoint)return;
   try{await webpush.sendNotification(s.subscription,JSON.stringify({title:intro+' · ZIP '+offer.zip,body:'Accept once in EZfix, SMS or WhatsApp.',offer_id:offer.id,expires_at:offer.expires_at}),{TTL:Math.max(0,Math.ceil((Date.parse(offer.expires_at)-Date.now())/1000)),urgency:'high',timeout:6000,vapidDetails:{subject:'mailto:office@ezfixgaragedoorsinc.com',publicKey:config.public_key,privateKey:config.private_key}});accepted++;}
   catch(e){if([404,410].includes(Number(e?.statusCode)))await db.from('push_subscriptions').delete().eq('id',s.id);}
  }));
  return {status:accepted?'accepted':'failed',accepted};
 }
 // Each channel runs independently; a failed provider cannot suppress the others.
 const results=await Promise.allSettled([demo?Promise.resolve({status:'suppressed_demo'}):sms(),whatsapp(),demo?Promise.resolve({status:'suppressed_demo'}):push()]);
 ['sms','whatsapp','push'].forEach((channel,i)=>{const r=results[i];notification[channel]=r.status==='fulfilled'?r.value:{status:'unconfirmed'};});
 const saved=await db.from('lead_offers').update({notification_status:notification}).eq('id',offer.id);
 return {...notification,saved:!saved.error};
}
