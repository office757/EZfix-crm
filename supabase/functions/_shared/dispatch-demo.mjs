// Run one ordered demo step. Never change production policy, impersonate an
// owner, retry an expired offer, or select a recipient from request content.
export function validDemoRun(run, now=Date.now()) {
 return !!run && run.enabled===true && Date.parse(run.expires_at)>now &&
  Date.parse(run.expires_at)-Date.parse(run.created_at)<=3600000 &&
  Array.isArray(run.lead_ids)&&run.lead_ids.length>0&&run.lead_ids.length<=7&&
  Array.isArray(run.technician_ids)&&run.technician_ids.length>0&&run.technician_ids.length<=10&&
  /^\+[1-9]\d{7,14}$/.test(run.recipient_phone);
}
export function validateDemoScope(run, leads, team) {
 if(leads.length!==run.lead_ids.length||team.length!==run.technician_ids.length)throw Error('Demo records are missing');
 if(leads.some(l=>!run.lead_ids.includes(l.id)||l.source!=='Demo'||l.deleted_at||l.app_data?.is_demo!==true||l.app_data?.demo_batch!==run.batch_id))throw Error('Demo lead scope mismatch');
 if(team.some(t=>!run.technician_ids.includes(t.id)||t.role!=='technician'||t.status!=='active'||!t.auth_user_id||t.app_data?.is_demo!==true||t.app_data?.demo_batch!==run.batch_id||t.app_data?.demo_contact_owner_confirmed!==true||t.app_data?.whatsapp_opt_in!==true||t.app_data?.notify_prefs?.newLead!==true||t.app_data?.whatsapp_number!==run.recipient_phone))throw Error('Demo recipient scope mismatch');
}
const data=r=>{if(r.error)throw Error('Demo data unavailable');return r.data;};
export async function runDemoStep(db,batch,evaluate,notify) {
 const run=data(await db.from('dispatch_demo_runs').select('*').eq('batch_id',batch).maybeSingle());
 if(!validDemoRun(run))throw Error('Demo run is disabled or expired');
 const policy=data(await db.from('dispatch_policy').select('*').eq('id',true).single());
 const manager=data(await db.from('ai_manager_settings').select('paused').eq('id','main').maybeSingle());
 if(policy.mode!=='automatic'||manager?.paused!==false)return {ok:true,offered:0,state:'paused'};
 const leads=data(await db.from('leads').select('*').in('id',run.lead_ids));
 const team=data(await db.from('team').select('id,role,status,auth_user_id,app_data').in('id',run.technician_ids));
 validateDemoScope(run,leads,team);
 const offers=data(await db.from('lead_offers').select('id,lead_id,status').in('lead_id',run.lead_ids));
 const decisions=data(await db.from('dispatch_decisions').select('lead_id,status,decision').in('lead_id',run.lead_ids));
 for(const id of run.lead_ids) {
  const existing=offers.filter(o=>o.lead_id===id);
  if(existing.length){
   if(existing.some(o=>o.status==='accepted'))continue;
   return {ok:true,offered:0,state:'awaiting_previous_offer',lead_id:id};
  }
  if(decisions.some(d=>d.lead_id===id&&d.status==='held'&&d.decision?.demo_run===batch))continue;
  const lead=leads.find(l=>l.id===id);
  if(lead.assigned_technician_id||['lost','cancelled'].includes(lead.status))throw Error('Demo lead no longer available');
  const {context,decision}=await evaluate(db,lead,policy.config);
  // All candidates must be from the explicit run, not merely share a label.
  if(decision.candidates.some(c=>!run.technician_ids.includes(c.technician_id)))throw Error('Demo candidate scope mismatch');
  decision.demo_run=batch;
  if(!decision.winner){
   data(await db.from('dispatch_decisions').insert({lead_id:id,status:'held',decision}));
   return {ok:true,offered:0,state:'held',lead_id:id,reason:decision.reason};
  }
  const w=decision.winner,stamps=context.jobs.filter(j=>j.technician_id===w.technician_id).map(j=>j.updated_at).filter(Boolean).sort();
  const result=await db.rpc('service_commit_routing_offer',{p_lead_id:id,p_technician_id:w.technician_id,p_decision:decision,p_policy_version:policy.updated_at,p_profile_version:w.profileVersion,p_lead_version:lead.updated_at,p_jobs_stamp:stamps.at(-1)||null});
  if(result.error)throw Error('Demo reservation changed or was rejected; no notification sent');
  const notification=await notify(db,result.data,{demoRun:run});
  return {ok:true,offered:1,lead_id:id,technician_id:w.technician_id,notification};
 }
 return {ok:true,offered:0,state:'complete'};
}
