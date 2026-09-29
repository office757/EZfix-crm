const roles=new Set(['owner','admin','dispatcher','office']);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const states=new Set(['starting','awaiting_qr','loading','ready','authentication_failed','disconnected','startup_failed']);
const terminal=new Set(['submitted','unconfirmed','not_registered']);
const check=r=>{if(r.error)throw new Error('Storage unavailable');return r.data;};
export function createHandler({db,authenticate,bridgeKey,now=()=>Date.now()}){
 const headers={'Access-Control-Allow-Origin':'https://ezfix-crm-sms-length-fixed.vercel.app','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
 const out=(status,value)=>Response.json(value,{status,headers});
 return async req=>{
  if(req.method==='OPTIONS')return out(200,{ok:true});
  if(req.method!=='POST')return out(405,{error:'POST required'});
  try{
   const raw=await req.text();if(raw.length>500000)return out(413,{error:'Request too large'});
   const b=JSON.parse(raw);if(!b||typeof b!=='object')return out(400,{error:'Invalid request'});
   const supplied=req.headers.get('x-wa-bridge-key');
   if(supplied!==null){
    // This credential has access only to the bridge protocol, never arbitrary DB actions.
    if(!bridgeKey||bridgeKey.length<32||supplied!==bridgeKey)return out(401,{error:'Unauthorized bridge'});
    if(!uuid(b.worker_id))return out(400,{error:'Invalid worker'});
    if(b.action==='result'){
     if(!uuid(b.request_id)||!terminal.has(b.state)||(b.provider_id!==null&&(typeof b.provider_id!=='string'||b.provider_id.length>500)))return out(400,{error:'Invalid result'});
     const rows=check(await db.from('wa_linked_sends').update({state:b.state,provider_id:b.provider_id,updated_at:new Date(now()).toISOString()}).eq('id',b.request_id).eq('worker_id',b.worker_id).eq('state','processing').select('id'));
     return out(200,{ok:true,recorded:rows.length===1});
    }
    if(b.action!=='sync'||!states.has(b.state)||!Array.isArray(b.events)||b.events.length>100)return out(400,{error:'Invalid sync'});
    const qr=b.qr_data_url;
    if(qr!==null&&(typeof qr!=='string'||qr.length>100000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr)))return out(400,{error:'Invalid QR'});
    let last=0;const rows=[];
    for(const e of b.events){
     if(!Number.isSafeInteger(e.seq)||e.seq<=last||typeof e.id!=='string'||!e.id||e.id.length>500)return out(400,{error:'Invalid event'});last=e.seq;
     let payload;
     if(e.type==='message'){
      if(!['inbound','outbound'].includes(e.direction)||typeof e.body!=='string'||e.body.length>20000||typeof e.chat_id!=='string'||!/^\d+@(c\.us|lid)$/.test(e.chat_id)||!Number.isFinite(e.timestamp))return out(400,{error:'Invalid message'});
      payload={type:e.type,id:e.id,chat_id:e.chat_id,direction:e.direction,body:e.body,timestamp:e.timestamp};
     }else if(e.type==='contact'&&e.id===e.chat_id&&/^\d+@lid$/.test(e.chat_id)&&typeof e.phone_e164==='string'&&/^\+[1-9]\d{7,14}$/.test(e.phone_e164))payload={type:e.type,id:e.id,chat_id:e.chat_id,phone_e164:e.phone_e164};
     else if(e.type==='ack'&&Number.isInteger(e.ack)&&e.ack>=-1&&e.ack<=4)payload={type:e.type,id:e.id,ack:e.ack};
     else return out(400,{error:'Invalid event type'});
     rows.push({event_key:e.type+':'+e.id+(e.type==='ack'?':'+e.ack:e.type==='contact'?':'+e.phone_e164:''),payload});
    }
    if(rows.length)check(await db.from('wa_linked_events').upsert(rows,{onConflict:'event_key',ignoreDuplicates:true}));
    check(await db.from('wa_linked_status').upsert({id:'primary',worker_id:b.worker_id,state:b.state,qr_data_url:b.state==='awaiting_qr'?qr:null,updated_at:new Date(now()).toISOString()}));
    const command=b.state==='ready'?check(await db.rpc('service_claim_wa_linked_send',{p_worker_id:b.worker_id})):null;
    return out(200,{ok:true,accepted_through:last,command});
   }
   const actor=await authenticate(req.headers.get('authorization'));
   if(!actor)return out(401,{error:'Sign in required'});
   if(!roles.has(actor.role))return out(403,{error:'Office access required'});
   const status=check(await db.from('wa_linked_status').select('*').eq('id','primary').maybeSingle());
   const online=!!status&&now()-Date.parse(status.updated_at)<45000;
   if(b.action==='status')return out(200,{ok:true,state:!bridgeKey?'not_configured':online?status.state:'offline',updated_at:status?.updated_at||null});
   if(b.action==='qr'){
    if(actor.role!=='owner')return out(403,{error:'Owner access required to link an account'});
    return out(200,{ok:true,qr_data_url:online&&status.state==='awaiting_qr'?status.qr_data_url:null});
   }
   if(b.action==='messages'){
    const events=check(await db.from('wa_linked_events').select('payload,received_at').order('received_at',{ascending:false}).limit(300));
    const sends=check(await db.from('wa_linked_sends').select('id,to_phone,state,provider_id,created_at').order('created_at',{ascending:false}).limit(100));
    return out(200,{ok:true,events,sends});
   }
   if(b.action==='send'){
    if(!uuid(b.request_id)||typeof b.to!=='string'||!/^\+[1-9]\d{7,14}$/.test(b.to)||typeof b.body!=='string'||!b.body.trim()||b.body.length>4096)return out(400,{error:'Enter an international phone number and a message'});
    // Read back a previous result even when the worker has since disconnected.
    const old=check(await db.from('wa_linked_sends').select('*').eq('id',b.request_id).maybeSingle());
    if(old)return out(old.to_phone===b.to&&old.body===b.body?200:409,old.to_phone===b.to&&old.body===b.body?{ok:true,id:old.id,state:old.state}:{error:'Request ID already used'});
    if(!bridgeKey||!online||status.state!=='ready')return out(409,{error:'WhatsApp is not connected'});
    const inserted=await db.from('wa_linked_sends').insert({id:b.request_id,created_by:actor.id,to_phone:b.to,body:b.body});
    if(inserted.error?.code==='23505')return out(409,{error:'Request already exists. Check its status before trying again.'});
    check(inserted);return out(200,{ok:true,id:b.request_id,state:'queued'});
   }
   return out(400,{error:'Unsupported action'});
  }catch{return out(400,{error:'Request could not be completed. Refresh before retrying.'});}
 };
}
