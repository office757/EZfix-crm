import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Inkbox } from "npm:@inkbox/sdk";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const out=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});
const IDENTITY="ashley-ezfixgaragedoorsinc";
const LEGACY_TAG="[EZFIX_CRM_GUARDRAILS_V2]";
const BEGIN_TAG="[EZFIX_CRM_GUARDRAILS_BEGIN]";
const END_TAG="[EZFIX_CRM_GUARDRAILS_END]";
const VERSION_TAG="[EZFIX_CRM_GUARDRAILS_V3]";
const legacyTail="- Never claim a payment, booking, technician assignment, or transfer succeeded unless the connected system actually confirms it.";
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
  const auth=req.headers.get("Authorization")||""; if(!auth.startsWith("Bearer "))return out({ok:false,error:"Unauthorized"},401);
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}}}); const {data:{user},error:ue}=await uc.auth.getUser(); if(ue||!user)return out({ok:false,error:"Unauthorized"},401);
  const db=createClient(url,service); const {data:member}=await db.from("team").select("id,role,status").eq("auth_user_id",user.id).maybeSingle(); if(!member||member.status!=="active")return out({ok:false,error:"Forbidden"},403);
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
    const {data:existing,error:readErr}=await db.from("calls").select("id,lead_id,lead_extraction_status,outcome").eq("provider_call_id",providerCallId).maybeSingle(); if(readErr)throw readErr;
    const providerFields={provider_call_id:providerCallId,mode:c.mode||"inkbox",summary,duration_sec:dur,transcript,direction:c.direction||null,remote_number:c.remotePhoneNumber||c.remote_phone_number||null,local_number:c.localPhoneNumber||c.local_phone_number||null,status:c.status||null,started_at:started,ended_at:ended,recording_url:c.recordingUrl||c.recording_url||c.audioUrl||c.audio_url||null,provider_data:c};
    let error:any;
    if(existing){({error}=await db.from("calls").update(providerFields).eq("id",existing.id));}
    else {({error}=await db.from("calls").insert({id:`inkbox_${providerCallId}`,...providerFields,lead_id:null,created_at:started||new Date().toISOString()}));}
    if(error)throw error;synced++;
   }catch(e:any){failed++;errors.push({call_id:String(c?.id||""),error:e?.message||String(e)});}
  }
  if(failed&&synced===0)return out({ok:false,error:"Inkbox calls were fetched but could not be saved",synced,failed,guardrailsUpdated,guardrailsVersion:"V3",details:errors.slice(0,5)},500);
  return out({ok:true,synced,failed,guardrailsUpdated,guardrailsVersion:"V3",details:errors.slice(0,5)});
 }catch(e:any){console.error("sync-inkbox-calls",e);return out({ok:false,error:e?.message||String(e)||"Call sync failed"},500);}
});