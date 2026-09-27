import { persistProviderRecording } from "../_shared/provider-recording-persistence.mjs";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Inkbox } from "npm:@inkbox/sdk";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-ezfix-cron-token","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const out=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});
const IDENTITY="ashley-ezfixgaragedoorsinc";
const LEGACY_TAG="[EZFIX_CRM_GUARDRAILS_V2]";
const BEGIN_TAG="[EZFIX_CRM_GUARDRAILS_BEGIN]";
const END_TAG="[EZFIX_CRM_GUARDRAILS_END]";
const VERSION_TAG="[EZFIX_CRM_GUARDRAILS_V3]";
const legacyTail="- Never claim a payment, booking, technician assignment, or transfer succeeded unless the connected system actually confirms it.";

function findRecordingUrl(...sources:any[]): string | null {
  const seen=new Set<any>();
  const walk=(value:any,path:string,depth:number):string|null=>{
    if(value==null||depth>6)return null;
    if(typeof value==="string"){
      return /(recording|audio|media)/i.test(path) && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
    }
    if(typeof value!=="object"||seen.has(value))return null;
    seen.add(value);
    if(Array.isArray(value)){
      for(let i=0;i<value.length;i++){const hit=walk(value[i],path+"["+i+"]",depth+1);if(hit)return hit;}
      return null;
    }
    const preferred=["recordingUrl","recording_url","audioUrl","audio_url","mediaUrl","media_url","recording","audio","media"];
    for(const key of preferred){
      if(Object.prototype.hasOwnProperty.call(value,key)){const hit=walk(value[key],path+"."+key,depth+1);if(hit)return hit;}
    }
    for(const [key,child] of Object.entries(value)){
      if(preferred.includes(key))continue;
      const hit=walk(child,path+"."+key,depth+1);if(hit)return hit;
    }
    return null;
  };
  for(const source of sources){const hit=walk(source,"provider",0);if(hit)return hit;}
  return null;
}

function safeRecordingUrl(value:string|null): string | null {
  if(!value)return null;
  try{
    const u=new URL(value);
    if(u.protocol!=="https:")return null;
    const h=u.hostname.toLowerCase();
    if(h==="localhost"||h==="127.0.0.1"||h==="::1"||h.endsWith(".local"))return null;
    if(/^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(h))return null;
    return u.toString();
  }catch{return null}
}
function recordingExt(url:string,contentType:string){
  const byType:Record<string,string>={"audio/mpeg":"mp3","audio/mp3":"mp3","audio/wav":"wav","audio/x-wav":"wav","audio/mp4":"m4a","audio/aac":"aac","audio/ogg":"ogg","audio/opus":"opus","audio/webm":"webm","video/webm":"webm","video/mp4":"mp4"};
  const base=String(contentType||"").split(";")[0].trim().toLowerCase();
  if(byType[base])return byType[base];
  try{const m=new URL(url).pathname.toLowerCase().match(/\.([a-z0-9]{2,5})$/);if(m&&["mp3","wav","m4a","aac","ogg","oga","opus","webm","mp4"].includes(m[1]))return m[1]}catch{}
  return "bin";
}
async function ingestProviderRecording(db:any,callId:string,recordingUrl:string|null){
  const safe=safeRecordingUrl(recordingUrl); if(!safe)return null;
  const {data:existing,error:readErr}=await db.from("calls").select("id,recording_asset").eq("provider_call_id",callId).maybeSingle(); if(readErr)throw readErr; if(!existing)throw new Error("Call unavailable for recording");
  if(existing?.recording_asset?.path)return existing.recording_asset;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const r=await fetch(safe,{signal:controller.signal,redirect:"follow"});
    if(!r.ok)throw new Error("recording download HTTP "+r.status);
    const declared=Number(r.headers.get("content-length")||0);
    if(Number.isFinite(declared)&&declared>104857600)throw new Error("recording exceeds 100 MB");
    const bytes=new Uint8Array(await r.arrayBuffer());
    if(!bytes.length||bytes.length>104857600)throw new Error("recording size invalid");
    const contentType=String(r.headers.get("content-type")||"application/octet-stream").split(";")[0].trim().toLowerCase();
    const ext=recordingExt(safe,contentType);
    if(ext==="bin"&&!contentType.startsWith("audio/")&&!contentType.startsWith("video/"))throw new Error("recording content type not audio/video");
    const path=`call-recordings/provider/${callId}/${crypto.randomUUID()}.${ext}`;
    const {error:upErr}=await db.storage.from("crm-assets").upload(path,bytes,{contentType:contentType||"application/octet-stream",upsert:false});
    if(upErr)throw upErr;
    const asset={id:"crm-assets/"+path,path,name:"Inkbox call recording."+ext,size:bytes.length,contentType,source:"inkbox_provider",sourceUrlHost:new URL(safe).hostname,attachedAt:new Date().toISOString()};
    return await persistProviderRecording(db,callId,asset);
  }finally{clearTimeout(timer)}
}

function stripManagedGuardrails(current:string){
  let s=String(current||"");
  const b=s.indexOf(BEGIN_TAG), e=s.indexOf(END_TAG);
  if(b>=0&&e>=b){s=(s.slice(0,b)+s.slice(e+END_TAG.length)).trim();}
  const l=s.indexOf(LEGACY_TAG);
  if(l>=0){
    const tail=s.indexOf(legacyTail,l);
    s=tail>=0?(s.slice(0,l)+s.slice(tail+legacyTail.length)).trim():s.slice(0,l).trim();
  }
  return s.trim();
}
function guardrailBlock(transfer:string){return `${BEGIN_TAG}\n${VERSION_TAG}\n- You are Ashley, the virtual receptionist for EZfix Garage Doors Inc. Be concise, friendly, and professional.\n- Your primary goal is to collect the caller's name, callback number, service address or city, garage-door problem, and preferred service date/time when possible, then preserve those details for EZfix follow-up. The inbound caller ID may be used as the callback number; never invent missing details.\n- Do not ask a caller to choose, guess, state, or confirm a payment amount merely to create, arrange, or schedule a repair or service visit. If the caller asks to schedule a payment, separate that request from appointment intake: collect the service details and explain that any payment amount must come from an existing CRM estimate or invoice.\n- Only discuss a specific payment amount when it is already tied to an existing estimate or invoice supplied by the business system. Never invent, negotiate, or quote a price that the business system has not provided.\n- Treat requested appointment dates and time windows as preferences unless real scheduling availability has been confirmed. If availability has not been checked, say EZfix will confirm the requested window.\n- Do not promise or state that an appointment is booked, scheduled, confirmed, reserved, or assigned unless the scheduling system has actually confirmed it.\n- Do not assign, name, or promise a technician unless the CRM explicitly returns a confirmed technician assignment. A caller's technician preference is not an assignment.\n- If the caller asks for a human, owner, manager, or representative, attempt a live transfer to ${transfer} only if the phone platform exposes a live-transfer capability. If live transfer is unavailable or fails, clearly say a human follow-up is needed, preserve the callback number, and do not claim that a transfer occurred.\n- Never claim a payment, booking, technician assignment, message delivery, or transfer succeeded unless the connected system actually confirms it.\n${END_TAG}`;}
async function ensureGuardrails(identity:any,db:any){
  const {data:settings}=await db.from("settings").select("ai_receptionist").eq("id","main").maybeSingle();
  const transfer=String(settings?.ai_receptionist?.humanTransferNumber||"+17742445533");
  const block=guardrailBlock(transfer);
  const cfg:any=await identity.getHostedAgentConfig();
  const current=String(cfg?.instructions||"");
  const existingStart=current.indexOf(BEGIN_TAG), existingEnd=current.indexOf(END_TAG);
  if(existingStart>=0&&existingEnd>=existingStart){
    const existing=current.slice(existingStart,existingEnd+END_TAG.length).trim();
    if(existing===block)return false;
  }
  const base=stripManagedGuardrails(current);
  const instructions=(base?base+"\n\n":"")+block;
  await identity.setHostedAgentConfig({voice:cfg?.voice??undefined,instructions});
  return true;
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization")||""; const cron=req.headers.get("x-ezfix-cron-token")||""; const cronSecret=Deno.env.get("EZFIX_CALL_SYNC_CRON_TOKEN")||""; const legacyCronSecret=Deno.env.get("EZFIX_INTEGRATION_ALERT_CRON_TOKEN")||Deno.env.get("ezfix_integration_alert_cron_token")||""; const cronOk=(!!cronSecret&&cron===cronSecret)||(!cronSecret&&!!legacyCronSecret&&cron===legacyCronSecret); if(!auth.startsWith("Bearer ")&&!cronOk)return out({ok:false,error:"Unauthorized"},401);
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(url,service); if(!cronOk){ const uc=createClient(url,anon,{global:{headers:{Authorization:auth}}}); const {data:{user},error:ue}=await uc.auth.getUser(); if(ue||!user)return out({ok:false,error:"Unauthorized"},401); const {data:member}=await db.from("team").select("id,role,status").eq("auth_user_id",user.id).maybeSingle(); if(!member||member.status!=="active")return out({ok:false,error:"Forbidden"},403); }
  const key=Deno.env.get("INKBOX_API_KEY"); if(!key)return out({ok:false,error:"Inkbox is not configured"},503);
  const inkbox=await new Inkbox({apiKey:key}).ready(); const identity=await inkbox.getIdentity(IDENTITY);let guardrailsUpdated=false;try{guardrailsUpdated=await ensureGuardrails(identity,db)}catch(e){console.error("hosted agent guardrail sync failed",e)}
  const calls:any[]=await identity.listCalls({limit:50,offset:0}); let synced=0,failed=0; const errors:any[]=[];
  for(const c of calls){
   try{
    let segs:any[]=[];try{segs=await identity.listTranscripts(c.id)}catch{}
    const transcript=segs.map((s:any)=>({party:s.party||null,text:s.text||"",createdAt:s.createdAt||s.created_at||null}));
    const started=c.startedAt||c.started_at||null,ended=c.endedAt||c.ended_at||null;
    const dur=started&&ended?Math.max(0,Math.round((new Date(ended).getTime()-new Date(started).getTime())/1000)):null;
    const summary=transcript.map((x:any)=>`${x.party||"speaker"}: ${x.text}`).join("\n").slice(0,2000)||(c.reason||null);
    const providerCallId=String(c.id);
    const {data:existing,error:readErr}=await db.from("calls").select("id,lead_id,lead_extraction_status,outcome,recording_url,recording_asset").eq("provider_call_id",providerCallId).maybeSingle(); if(readErr)throw readErr;
    let detail:any=null;try{detail=await inkbox.calls.get(providerCallId)}catch{} const discoveredRecording=findRecordingUrl(detail,c)||existing?.recording_url||null; const providerFields={provider_call_id:providerCallId,mode:c.mode||"inkbox",summary,duration_sec:dur,transcript,direction:c.direction||null,remote_number:c.remotePhoneNumber||c.remote_phone_number||null,local_number:c.localPhoneNumber||c.local_phone_number||null,status:c.status||null,started_at:started,ended_at:ended,recording_url:discoveredRecording,provider_data:detail||c};
    let error:any;
    if(existing){({error}=await db.from("calls").update(providerFields).eq("id",existing.id));}
    else {({error}=await db.from("calls").insert({id:`inkbox_${providerCallId}`,...providerFields,lead_id:null,created_at:started||new Date().toISOString()}));}
    if(error)throw error; if(!existing?.recording_asset&&discoveredRecording){try{await ingestProviderRecording(db,providerCallId,discoveredRecording)}catch(e){console.error("automatic recording ingestion failed",providerCallId,e)}} synced++;
   }catch(e:any){failed++;errors.push({call_id:String(c?.id||""),error:e?.message||String(e)});}
  }
  if(failed&&synced===0)return out({ok:false,error:"Inkbox calls were fetched but could not be saved",synced,failed,guardrailsUpdated,guardrailsVersion:"V3",details:errors.slice(0,5)},500);
  return out({ok:true,synced,failed,guardrailsUpdated,guardrailsVersion:"V3",details:errors.slice(0,5)});
 }catch(e:any){console.error("sync-inkbox-calls",e);return out({ok:false,error:e?.message||String(e)||"Call sync failed"},500);}
});