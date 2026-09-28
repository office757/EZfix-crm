import { createClient } from "npm:@supabase/supabase-js@2.99.2";
import { DEFAULT_POLICY, normalizePolicy, validateProfile, rankTechnicians, localDate, parseWindow, classifyService, validDate } from "../_shared/dispatch-ranking.mjs";
import { notifyLeadOffer } from "../_shared/lead-offer-notifications.ts";
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-ezfix-cron-token','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const out=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
const requireData=(r:any)=>{if(r.error)throw new Error('Business data could not be loaded.');return r.data;};
async function allRows(makeQuery:any){
 const rows:any[]=[];
 for(let page=0;page<10;page++){
  const batch=requireData(await makeQuery().order('id').range(page*1000,(page+1)*1000-1));
  rows.push(...batch);if(batch.length<1000)return rows;
 }
 throw new Error('Routing history exceeds the supported limit. Office dispatch remains available.');
}
async function dataset(db:any){
 const [team,profiles,jobs,invoices,offers]=await Promise.all([
  allRows(()=>db.from('team').select('id,name,role,status,auth_user_id').eq('role','technician')),
  db.from('technician_dispatch_profiles').select('*').then(requireData),
  allRows(()=>db.from('jobs').select('id,technician_id,status,scheduled_date,appointment_window,app_data,title,created_at,updated_at,deleted_at').is('deleted_at',null)),
  allRows(()=>db.from('invoices').select('id,job_id,items,discount,deleted_at,app_data').is('deleted_at',null)),
  allRows(()=>db.from('lead_offers').select('id,lead_id,technician_id,status,expires_at,created_at').gte('created_at',new Date(Date.now()-90*86400000).toISOString()))
 ]);
 return {team,profiles,jobs,invoices:invoices.map((invoice:any)=>({...invoice,status:invoice.app_data?.status})),offers};
}
function deriveSlot(text:string,at:string,timezone:string){
 const s=String(text||'').toLowerCase();if(/\b(next|maybe|possibly|either|or|not sure)\b/.test(s))return null;const base=localDate(at,timezone).date,d=new Date(base+'T12:00Z');
 let date=s.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0]||null;
 if(!date){if(/tomorrow/.test(s))d.setUTCDate(d.getUTCDate()+1);else if(!/today|this morning|this afternoon|this evening/.test(s)){const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'],day=days.findIndex(v=>s.includes(v));if(day<0)return null;d.setUTCDate(d.getUTCDate()+(day-d.getUTCDay()+7)%7);}date=d.toISOString().slice(0,10);}
 const range=s.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to|and)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/)?.[0];
 const window=parseWindow(range||s.match(/morning|afternoon|evening/)?.[0]);
 return window&&validDate(date)?{date,start:window[0],end:window[1]}:null;
}
async function prepareLead(db:any,lead:any,policy:any){
 if(lead.source!=='AI Receptionist')return {lead,hold:null}; // Office previews are allowed for other sources; the automatic commit rejects them.
 const calls=requireData(await db.from('calls').select('lead_extraction,started_at,created_at').eq('lead_id',lead.id).order('created_at',{ascending:false}).limit(1));
 const call=calls[0],ex=call?.lead_extraction;
 if(!ex||ex.receptionist_guardrails?.requires_review||ex.identity_match?.requires_manual_review||ex.human_transfer_requested)return {lead,hold:'Call intake needs office review before automatic routing.'};
 if(!ex.caller_details_complete&&!lead.converted_job_id)return {lead,hold:'Ashley still needs complete caller details and a requested service window.'};
 const a={...(lead.app_data||{})},derived=deriveSlot(ex.preferred_service_window,call.started_at||call.created_at,policy.timezone);
 if(!a.zip)a.zip=String(lead.address||ex.address||'').match(/\b\d{5}(?:-\d{4})?\b/)?.[0];
 if(!a.preferred_appointment&&!a.routing_date&&derived){a.routing_date=derived.date;a.routing_start_minute=derived.start;a.routing_end_minute=derived.end;}
 if(!a.preferred_time&&!a.routing_start_minute&&derived){a.routing_start_minute=derived.start;a.routing_end_minute=derived.end;}
 a.routing_type=a.routing_type||classifyService(lead.service_requested);
 return {lead:{...lead,app_data:a},hold:null};
}
async function evaluate(db:any,lead:any,policy:any){
 const context=await dataset(db),prepared=await prepareLead(db,lead,policy);
 const decision=prepared.hold?{status:'held',reason:prepared.hold,candidates:[]}:rankTechnicians({...context,lead:prepared.lead,policy});
 return {context,decision};
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return out({ok:false,error:'Method not allowed'},405);
 const secret=Deno.env.get('EZFIX_CALL_SYNC_CRON_TOKEN')||Deno.env.get('EZFIX_INTEGRATION_ALERT_CRON_TOKEN')||'';
 const cron=!!secret&&req.headers.get('x-ezfix-cron-token')===secret;
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
 const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 let member:any=null;
 if(!cron){
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer '))return out({ok:false,error:'Sign in required'},401);
  const scoped=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user},error}=await scoped.auth.getUser(authorization.slice(7));
  if(error||!user)return out({ok:false,error:'Sign in required'},401);
  member=(await db.from('team').select('id,role').eq('auth_user_id',user.id).eq('status','active').maybeSingle()).data;
  if(!member||!['owner','admin','dispatcher'].includes(member.role))return out({ok:false,error:'Office access required'},403);
 }
 const raw=await req.text();if(raw.length>50000)return out({ok:false,error:'Request too large'},413);let body:any;try{body=JSON.parse(raw);}catch{return out({ok:false,error:'Invalid request'},400);}const action=cron?'run':body?.action;
 try{
  const pol=requireData(await db.from('dispatch_policy').select('*').eq('id',true).single()),policy=normalizePolicy(pol.config);
  const manager=requireData(await db.from('ai_manager_settings').select('paused').eq('id','main').maybeSingle());
  if(action==='state'){
   const profiles=requireData(await db.from('technician_dispatch_profiles').select('*'));
   const decisions=requireData(await db.from('dispatch_decisions').select('*').order('created_at',{ascending:false}).limit(20));
   return out({ok:true,policy:{...pol,config:policy},profiles,decisions,paused:manager?.paused!==false});
  }
  if(action==='save_policy'){
   if(member?.role!=='owner')return out({ok:false,error:'Only the owner can change automatic routing.'},403);
   if(!['off','recommend','automatic'].includes(body.mode))return out({ok:false,error:'Choose a routing mode.'},400);
   if(body.mode==='automatic'){const ready=requireData(await db.from('technician_dispatch_profiles').select('technician_id,profile'));const team=requireData(await db.from('team').select('id,role,status,auth_user_id'));if(!ready.some((r:any)=>r.profile?.enabled&&team.some((t:any)=>t.id===r.technician_id&&t.role==='technician'&&t.status==='active'&&t.auth_user_id)))return out({ok:false,error:'Enable a complete technician profile with active app access first.'},400);}
   const config=normalizePolicy(body.config||{}),at=new Date().toISOString();
   const result=await db.from('dispatch_policy').update({mode:body.mode,config,updated_at:at,...(body.mode==='automatic'&&pol.mode!=='automatic'?{enabled_since:at}:{})}).eq('id',true);
   requireData(result);return out({ok:true});
  }
  if(action==='save_profile'){
   if(member?.role!=='owner')return out({ok:false,error:'Only the owner can change technician routing profiles.'},403);
   const tech=requireData(await db.from('team').select('id,role').eq('id',String(body.technician_id||'')).maybeSingle());
   if(tech?.role!=='technician')return out({ok:false,error:'Choose a technician.'},400);
   const profile=validateProfile(body.profile);
   requireData(await db.from('technician_dispatch_profiles').upsert({technician_id:tech.id,profile,updated_at:new Date().toISOString()},{onConflict:'technician_id'}));
   return out({ok:true});
  }
  if(action==='preview'){
   const lead=requireData(await db.from('leads').select('*').eq('id',String(body.lead_id||'')).is('deleted_at',null).maybeSingle());
   if(!lead)return out({ok:false,error:'Lead not available'},404);
   const {decision}=await evaluate(db,lead,policy);return out({ok:true,decision});
  }
  if(action!=='run')return out({ok:false,error:'Unsupported action'},400);
  if(!cron&&member?.role!=='owner')return out({ok:false,error:'Owner access required'},403);
  if(pol.mode!=='automatic'||manager?.paused!==false)return out({ok:true,mode:pol.mode,paused:manager?.paused!==false,offered:0});
  const leads=await allRows(()=>db.from('leads').select('*').eq('source','AI Receptionist').is('assigned_technician_id',null).is('deleted_at',null).not('status','in','(lost,cancelled)').gte('created_at',pol.enabled_since));
  const recent=requireData(await db.from('dispatch_decisions').select('lead_id,created_at').order('created_at',{ascending:false}).limit(1000));const checked=new Map();for(const d of recent)if(!checked.has(d.lead_id))checked.set(d.lead_id,d.created_at);leads.sort((a:any,b:any)=>String(checked.get(a.id)||'').localeCompare(String(checked.get(b.id)||''))||a.created_at.localeCompare(b.created_at));
  let offered=0,held=0;
  for(const lead of leads.slice(0,40)){
   if(offered>=3)break;
   const existing=requireData(await db.from('lead_offers').select('id,status,expires_at').eq('lead_id',lead.id));
   if(existing.some((o:any)=>o.status==='pending'&&Date.parse(o.expires_at)>Date.now()))continue;
   const {context,decision}=await evaluate(db,lead,policy);
   if(existing.length>=policy.maxAttempts){decision.status='held';decision.reason='Automatic offer limit reached. Office review needed.';decision.winner=null;}
   if(!decision.winner){
    held++;const last=requireData(await db.from('dispatch_decisions').select('id,status,decision').eq('lead_id',lead.id).order('created_at',{ascending:false}).limit(1));
    if(last[0]?.status!=='held'||last[0]?.decision?.reason!==decision.reason)requireData(await db.from('dispatch_decisions').insert({lead_id:lead.id,status:'held',decision}));else requireData(await db.from('dispatch_decisions').update({created_at:new Date().toISOString()}).eq('id',last[0].id));
    continue;
   }
   const w=decision.winner,stamps=context.jobs.filter((j:any)=>j.technician_id===w.technician_id).map((j:any)=>j.updated_at).filter(Boolean).sort();
   const committed=await db.rpc('service_commit_routing_offer',{p_lead_id:lead.id,p_technician_id:w.technician_id,p_decision:decision,p_policy_version:pol.updated_at,p_profile_version:w.profileVersion,p_lead_version:lead.updated_at,p_jobs_stamp:stamps.at(-1)||null});
   if(committed.error)continue; // Changed schedule/profile or another worker won; rerank next cycle.
   await notifyLeadOffer(db,committed.data);offered++;
  }
  return out({ok:true,mode:pol.mode,offered,held});
 }catch(e){return out({ok:false,error:e instanceof Error?e.message:'Routing unavailable'},400);}
});
