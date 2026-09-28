import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { planTranscriptReplay, renderTranscriptReplay, createOpenAIReplaySynthesizer } from "../_shared/transcript-replay.mjs";

const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-ezfix-cron-token","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers});
const PARTY_MAP=Object.freeze({local:"ashley",remote:"customer"});
const cleanError=(e:any)=>String(e?.message||"transcript_replay_failed").replace(/[^a-z0-9_ -]/gi,"").slice(0,120)||"transcript_replay_failed";
const dayStart=()=>{const d=new Date();return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())).toISOString()};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers});
  if(req.method!=="POST") return json({ok:false,error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cron=req.headers.get("x-ezfix-cron-token")||"";
  const cronSecret=Deno.env.get("EZFIX_CALL_SYNC_CRON_TOKEN")||"";
  const cronOk=!!cronSecret&&cron===cronSecret;
  const auth=req.headers.get("Authorization")||"";
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  if(!cronOk){
    if(!auth.startsWith("Bearer ")) return json({ok:false,error:"Unauthorized"},401);
    const scoped=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:ue}=await scoped.auth.getUser();
    if(ue||!user) return json({ok:false,error:"Unauthorized"},401);
    const {data:member}=await db.from("team").select("role,status").eq("auth_user_id",user.id).maybeSingle();
    if(!member||member.status!=="active"||!["owner","admin"].includes(String(member.role||"").toLowerCase())) return json({ok:false,error:"Forbidden"},403);
  }
  const apiKey=Deno.env.get("OPENAI_API_KEY")||"";
  if(!apiKey) return json({ok:true,configured:false,processed:false,reason:"OPENAI_API_KEY missing"});
  // Check storage before claiming a call or making any billable speech request.
  // Production originally allowed only images/PDFs, which discarded generated WAVs.
  try {
    const {data:bucket,error:bucketError}=await db.storage.getBucket("crm-assets");
    if(bucketError||!bucket) return json({ok:false,error:"replay_storage_unavailable"},503);
    if(bucket.public!==false) return json({ok:false,error:"replay_storage_must_be_private"},503);
    const types=bucket.allowed_mime_types;
    if(types!==null && types!==undefined && (!Array.isArray(types)||!types.some((type:string)=>["audio/wav","audio/*","*/*"].includes(type)))) {
      return json({ok:false,error:"replay_storage_wav_not_allowed"},503);
    }
  } catch {
    return json({ok:false,error:"replay_storage_unavailable"},503);
  }
  const dailyLimit=Math.min(100,Math.max(1,Number(Deno.env.get("TRANSCRIPT_REPLAY_MAX_DAILY")||25)||25));
  const {count:todayCount,error:countErr}=await db.from("calls").select("id",{count:"exact",head:true}).eq("transcript_replay_status","ready").gte("transcript_replay_updated_at",dayStart());
  if(countErr) return json({ok:false,error:"Replay budget lookup failed"},500);
  if((todayCount||0)>=dailyLimit) return json({ok:true,configured:true,processed:false,budgetReached:true,dailyLimit});

  const {data:candidates,error:listErr}=await db.from("calls")
    .select("id,transcript,transcript_replay_asset,transcript_replay_source_hash,transcript_replay_generation,ended_at")
    .eq("transcript_replay_status","pending")
    .not("transcript","is",null)
    .order("ended_at",{ascending:true,nullsFirst:false})
    .limit(5);
  if(listErr) return json({ok:false,error:"Replay queue lookup failed"},500);
  let call:any=null;
  for(const candidate of candidates||[]){
    const now=new Date().toISOString();
    const {data:claimed,error:claimErr}=await db.from("calls")
      .update({transcript_replay_status:"generating",transcript_replay_error:null,transcript_replay_updated_at:now})
      .eq("id",candidate.id)
      .eq("transcript_replay_status","pending")
      .eq("transcript_replay_generation",candidate.transcript_replay_generation)
      .select("id,transcript,transcript_replay_asset,transcript_replay_source_hash,transcript_replay_generation")
      .maybeSingle();
    if(claimErr) return json({ok:false,error:"Replay claim failed"},500);
    if(claimed){call=claimed;break}
  }
  if(!call) return json({ok:true,configured:true,processed:false,queueEmpty:true});

  let uploadedPath="";
  const oldPath=String(call.transcript_replay_asset?.path||"");
  try{
    const ashleyVoice=String(Deno.env.get("TRANSCRIPT_REPLAY_ASHLEY_VOICE")||"coral");
    const customerVoice=String(Deno.env.get("TRANSCRIPT_REPLAY_CUSTOMER_VOICE")||"alloy");
    const plan=await planTranscriptReplay({callId:call.id,transcript:call.transcript,partyMap:PARTY_MAP,voices:{ashley:ashleyVoice,customer:customerVoice}});
    if(call.transcript_replay_asset?.path && call.transcript_replay_source_hash===plan.sourceHash){
      await db.from("calls").update({transcript_replay_status:"ready",transcript_replay_error:null,transcript_replay_updated_at:new Date().toISOString()})
        .eq("id",call.id).eq("transcript_replay_generation",call.transcript_replay_generation);
      return json({ok:true,configured:true,processed:true,reused:true,callId:call.id});
    }
    const synthesize=createOpenAIReplaySynthesizer({apiKey});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),120000);
    let rendered;
    try{rendered=await renderTranscriptReplay(plan,{synthesize,signal:controller.signal,pauseMs:180})}
    finally{clearTimeout(timer)}
    uploadedPath=`transcript-replays/${call.id}/${plan.sourceHash}.wav`;
    const {error:upErr}=await db.storage.from("crm-assets").upload(uploadedPath,rendered.audio,{contentType:"audio/wav",upsert:false});
    if(upErr && !String(upErr.message||"").toLowerCase().includes("already")) throw new Error("storage_upload_failed");
    const asset={
      id:"crm-assets/"+uploadedPath,path:uploadedPath,name:"AI transcript replay.wav",size:rendered.audio.length,contentType:"audio/wav",
      kind:"synthetic_transcript_audio",isOriginalRecording:false,disclosure:rendered.metadata.disclosure,sourceHash:plan.sourceHash,
      model:"gpt-4o-mini-tts-2025-12-15",voices:{ashley:ashleyVoice,customer:customerVoice},durationSec:rendered.metadata.durationSec,
      generatedAt:new Date().toISOString(),cues:rendered.metadata.cues
    };
    const {data:saved,error:saveErr}=await db.from("calls")
      .update({transcript_replay_asset:asset,transcript_replay_status:"ready",transcript_replay_source_hash:plan.sourceHash,transcript_replay_error:null,transcript_replay_updated_at:new Date().toISOString()})
      .eq("id",call.id).eq("transcript_replay_status","generating").eq("transcript_replay_generation",call.transcript_replay_generation)
      .select("id").maybeSingle();
    if(saveErr||!saved){
      await db.storage.from("crm-assets").remove([uploadedPath]).catch(()=>{});
      return json({ok:true,configured:true,processed:false,stale:true,callId:call.id});
    }
    if(oldPath&&oldPath!==uploadedPath&&oldPath.startsWith("transcript-replays/")) await db.storage.from("crm-assets").remove([oldPath]).catch(()=>{});
    return json({ok:true,configured:true,processed:true,callId:call.id,status:"ready",sourceHash:plan.sourceHash});
  }catch(e:any){
    if(uploadedPath) await db.storage.from("crm-assets").remove([uploadedPath]).catch(()=>{});
    const code=cleanError(e);
    await db.from("calls").update({transcript_replay_status:"failed",transcript_replay_error:code,transcript_replay_updated_at:new Date().toISOString()})
      .eq("id",call.id).eq("transcript_replay_status","generating").eq("transcript_replay_generation",call.transcript_replay_generation);
    console.error("generate-transcript-replay",code);
    return json({ok:false,error:"Transcript replay generation failed",callId:call.id},500);
  }
});
