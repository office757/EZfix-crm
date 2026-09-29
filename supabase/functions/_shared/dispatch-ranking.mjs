// Business routing is deterministic and explainable. Caller text never controls
// permissions, weights, technician IDs, pricing, or the final assignment.
export const SERVICE_TYPES=['spring','opener','installation','repair','maintenance','commercial'];
export const DEFAULT_POLICY={timezone:'America/New_York',weights:{profit:30,skill:25,conversion:15,travel:15,availability:10,fairness:5},fairnessTolerance:12,minScore:55,maxAttempts:3,profitTarget:250,maxTravelMinutes:60,travelCostPerMinute:0.6,bufferMinutes:15};
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const round=n=>Math.round(n*100)/100;
export function classifyService(text){const s=String(text||'').toLowerCase();if(/commercial|industrial|rolling steel/.test(s))return 'commercial';if(/install|replacement door|new (?:garage )?door|replace (?:the )?door/.test(s))return 'installation';if(/spring/.test(s))return 'spring';if(/opener|motor|remote|keypad/.test(s))return 'opener';if(/maintenan|tune.up|lubricat|inspection/.test(s))return 'maintenance';if(/repair|cable|roller|off.track|won.t (?:open|close)|stuck/.test(s))return 'repair';return null;}
export function clockMinutes(s){const m=String(s||'').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);if(!m)return null;let h=+m[1],min=+(m[2]||0);if(min>59||h>23||m[3]&&(h<1||h>12))return null;if(m[3])h=h%12+(/pm/i.test(m[3])?12:0);return h*60+min;}
export function parseWindow(text){
 const s=String(text||'').toLowerCase().replace(/a\.m\./g,'am').replace(/p\.m\./g,'pm').trim();
 if(s==='morning')return [480,720];if(s==='afternoon')return [720,1020];if(s==='evening')return [1020,1200];
 const m=s.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to|and)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/);if(!m)return null;
 let a=m[1],b=m[2];const suffix=b.match(/(am|pm)$/)?.[1];if(suffix&&!/(am|pm)$/.test(a)){a+=suffix;const first=clockMinutes(a),last=clockMinutes(b);if(first!==null&&last!==null&&first>=last&&suffix==='pm')a=m[1]+'am';}
 const start=clockMinutes(a),end=clockMinutes(b);return start!==null&&end!==null&&end>start?[start,end]:null;
}
export function localDate(instant,tz){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,minute:+p.hour*60 + +p.minute};}
export function zonedInstant(date,minute,tz){const target=Date.parse(date+'T00:00:00Z')+minute*60000;let guess=target;for(let i=0;i<3;i++){const parts=localDate(guess,tz),shown=Date.parse(parts.date+'T00:00:00Z')+parts.minute*60000;guess+=target-shown;}return new Date(guess).toISOString();}
export function validDate(date){return /^\d{4}-\d{2}-\d{2}$/.test(date||'')&&Number.isFinite(Date.parse(date))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;}
export function requestedSlot(lead){const a=lead.app_data||{},saved=a.routing_request,date=saved?.date||a.routing_date||a.preferred_appointment||a.preferred_date,window=saved&&Number.isInteger(saved.start)&&Number.isInteger(saved.end)?[saved.start,saved.end]:Number.isInteger(a.routing_start_minute)&&Number.isInteger(a.routing_end_minute)?[a.routing_start_minute,a.routing_end_minute]:parseWindow(a.preferred_time||a.appointment_window);return validDate(date)&&window&&window[0]>=0&&window[1]<=1440&&window[0]<window[1]?{date,start:window[0],end:window[1]}:null;}
export function normalizePolicy(input={}){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid routing policy.');const p={...DEFAULT_POLICY,...input,weights:Object.fromEntries(Object.keys(DEFAULT_POLICY.weights).map(k=>[k,input.weights?.[k]??DEFAULT_POLICY.weights[k]]))};new Intl.DateTimeFormat('en',{timeZone:p.timezone});for(const k of Object.keys(DEFAULT_POLICY.weights))p.weights[k]=clamp(num(p.weights[k]),0,100);if(!Object.values(p.weights).some(x=>x>0))throw Error('Choose at least one scoring factor.');const businessWeight=Object.entries(p.weights).filter(([k])=>k!=='fairness').reduce((sum,[,v])=>sum+v,0);if(!businessWeight)throw Error('Keep at least one business factor enabled.');p.weights.fairness=Math.min(p.weights.fairness,20,businessWeight/4);for(const [k,a,b] of [['fairnessTolerance',0,20],['minScore',0,100],['maxAttempts',1,10],['profitTarget',1,10000],['maxTravelMinutes',1,240],['travelCostPerMinute',0,20],['bufferMinutes',0,120]])p[k]=clamp(num(p[k],DEFAULT_POLICY[k]),a,b);p.maxAttempts=Math.floor(p.maxAttempts);return p;}
export function validateProfile(p){
 if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Invalid technician profile.');
 const shifts=p.shifts||{},specialties=p.specialties||{},travel=p.travelMinutesByZip||{};if([shifts,specialties,travel].some(v=>!v||typeof v!=='object'||Array.isArray(v)))throw Error('Invalid routing profile fields.');if(Object.keys(travel).length>300)throw Error('Use no more than 300 service ZIPs per technician.');
 for(const [day,v] of Object.entries(shifts))if(!/^[0-6]$/.test(day)||!Array.isArray(v)||v.length!==2||!v.every(Number.isInteger)||v[0]<0||v[1]>1440||v[1]<=v[0])throw Error('Enter valid working hours.');
 for(const [zip,v] of Object.entries(travel))if(!/^\d{5}$/.test(zip)||!Number.isFinite(v)||v<0||v>240)throw Error('Use ZIP: travel minutes for each service area.');
 for(const [type,v] of Object.entries(specialties)){if(!SERVICE_TYPES.includes(type)||!v||typeof v!=='object')throw Error('Choose a supported job type.');for(const [k,a,b] of [['skill',1,5],['closeRate',0,100],['averageTicket',0,50000],['durationMinutes',15,1440],['materialCost',0,50000]])if(!Number.isFinite(v[k])||v[k]<a||v[k]>b)throw Error('Complete the skill, close rate, ticket, time and materials for each job type.');}
 if(!Number.isInteger(p.dailyLimit)||p.dailyLimit<1||p.dailyLimit>30||!Number.isFinite(p.hourlyCost)||p.hourlyCost<0||p.hourlyCost>1000)throw Error('Enter a daily job limit and hourly cost.');
 if(p.enabled&&(!Object.keys(shifts).length||!Object.keys(specialties).length||!Object.keys(travel).length))throw Error('Add job types, service ZIPs and working hours before enabling routing.');
 return {enabled:p.enabled===true,dailyLimit:p.dailyLimit,hourlyCost:p.hourlyCost,commissionPercent:clamp(num(p.commissionPercent,30),0,100),shifts,specialties,travelMinutesByZip:travel};
}
function saleValue(invoice){const items=Array.isArray(invoice.items)?invoice.items:[];const subtotal=items.reduce((s,x)=>s+num(x.qty)*num(x.rate),0);return Math.max(0,subtotal-num(invoice.discount));}
export function rankTechnicians({lead,team,profiles,jobs=[],invoices=[],offers=[],policy:input={},now=Date.now()}){
 const policy=normalizePolicy(input),slot=requestedSlot(lead),type=lead.app_data?.routing_type||classifyService(lead.service_requested),zip=String(lead.app_data?.zip||'').slice(0,5),today=localDate(now,policy.timezone);
 const hold=[];if(!slot)hold.push('Add a dated service window.');if(!type||!SERVICE_TYPES.includes(type))hold.push('Confirm the job type.');if(!/^\d{5}$/.test(zip))hold.push('Add a valid ZIP.');
 if(!lead.name||/^new (phone|referral)/i.test(lead.name)||!lead.address||String(lead.phone||'').replace(/\D/g,'').length<10)hold.push('Complete the customer name, callback number and service address.');
 if(slot&&(slot.date<today.date||slot.date===today.date&&slot.end<=today.minute))hold.push('The requested window has passed.');
 if(hold.length)return {status:'held',reason:hold.join(' '),candidates:[],type,slot,zip};
 const weekDate=new Date(today.date+'T12:00Z');weekDate.setUTCDate(weekDate.getUTCDate()-(weekDate.getUTCDay()+6)%7);const weekStart=weekDate.toISOString().slice(0,10),weekEnd=new Date(weekDate.getTime()+7*86400000).toISOString().slice(0,10);
 const day=new Date(slot.date+'T12:00Z').getUTCDay();
 const candidates=team.filter(t=>t.role==='technician').map(t=>{
  const record=profiles.find(x=>x.technician_id===t.id),p=record?.profile||{},s=p.specialties?.[type],reasons=[],excluded=[];
  if(t.status!=='active'||!t.auth_user_id)excluded.push('Active app access required');
  try{validateProfile(p);}catch{excluded.push('Complete a valid routing profile');}if(!p.enabled)excluded.push('Routing profile not enabled');if(!s)excluded.push('Job type not enabled');
  const travel=p.travelMinutesByZip?.[zip];if(!Number.isFinite(travel))excluded.push('ZIP travel estimate missing');else if(travel>policy.maxTravelMinutes)excluded.push('Outside the travel limit');
  const shift=p.shifts?.[day];if(!shift)excluded.push('Outside working days');
  const prior=offers.filter(o=>o.technician_id===t.id&&o.lead_id===lead.id);if(prior.some(o=>['declined','expired','cancelled'].includes(o.status)||o.status==='pending'&&Date.parse(o.expires_at)<=now))excluded.push('Already declined or expired for this lead');
  if(offers.some(o=>o.technician_id===t.id&&o.status==='pending'&&Date.parse(o.expires_at)>now))excluded.push('Already has an unanswered offer');
  const own=jobs.filter(j=>j.technician_id===t.id&&!j.deleted_at),dayJobs=own.filter(j=>j.scheduled_date===slot.date&&j.status!=='cancelled'),weekly=own.filter(j=>j.status!=='cancelled'&&j.scheduled_date>=weekStart&&j.scheduled_date<weekEnd).length;
  if(dayJobs.length>=num(p.dailyLimit,1))excluded.push('Daily capacity reached');
  const duration=num(s?.durationMinutes,90),buffer=policy.bufferMinutes;let start=Math.max(slot.start,shift?.[0]||0)+(num(travel)+buffer);
  if(slot.date===today.date)start=Math.max(start,today.minute+num(travel)+buffer);
  // Sort the same reserved intervals that we check. Broad arrival windows can
  // be identical while their actual bookings are in a different order.
  const busyWindows=dayJobs.map(j=>{const block=j.app_data?.routing_slot;return block?[block.start,block.end]:parseWindow(j.appointment_window);});
  for(const win of busyWindows.sort((a,b)=>(a?.[0]??Infinity)-(b?.[0]??Infinity))){
   if(!win||!win.every(Number.isInteger)||win[0]<0||win[1]>1440||win[1]<=win[0]){excluded.push('Existing job has no reliable time window');continue;}
   if(start<win[1]+buffer&&start+duration>win[0]-buffer)start=win[1]+buffer+num(travel);
  }
  if(!shift||start+duration>Math.min(slot.end,shift?.[1]||0))excluded.push('No room in the requested window');
  const history=own.filter(j=>['completed','cancelled'].includes(j.status)&&(j.app_data?.routing_type||classifyService(j.title))===type&&Date.parse(j.updated_at||j.created_at)>now-90*86400000);
  const won=history.filter(j=>j.status==='completed'),sample=history.length;
  const priorClose=num(s?.closeRate,50)/100,closeRate=(won.length+priorClose*8)/(sample+8);
  const sales=invoices.filter(i=>!i.deleted_at&&i.status!=='void'&&won.some(j=>j.id===i.job_id)).reduce((map,i)=>map.set(i.job_id,(map.get(i.job_id)||0)+saleValue(i)),new Map());const saleValues=[...sales.values()].filter(x=>x>0);
  const avgTicket=(saleValues.reduce((a,b)=>a+b,0)+num(s?.averageTicket)*5)/(saleValues.length+5);
  const expectedProfit=(avgTicket-num(s?.materialCost))*closeRate*(1-clamp(num(p.commissionPercent,30),0,100)/100)-(duration/60)*num(p.hourlyCost)-num(travel)*policy.travelCostPerMinute;
  if(expectedProfit<=0)excluded.push('Expected contribution is not positive');
  const features={profit:clamp(expectedProfit/policy.profitTarget)*100,skill:num(s?.skill)/5*100,conversion:closeRate*100,travel:clamp(1-num(travel)/policy.maxTravelMinutes)*100,availability:clamp(1-(start-slot.start)/Math.max(1,slot.end-slot.start))*100,fairness:100/(1+weekly)};
  const businessKeys=['profit','skill','conversion','travel','availability'],sum=businessKeys.reduce((a,k)=>a+policy.weights[k],0)||1,businessScore=businessKeys.reduce((a,k)=>a+features[k]*policy.weights[k],0)/sum;
  reasons.push(`${round(expectedProfit)} estimated contribution`,`${round(closeRate*100)}% completion likelihood (${sample} recent outcomes + owner baseline)`,`${travel??'Unknown'} min travel estimate`,`${weekly} assigned or completed jobs this service week`);
  return {technician_id:t.id,name:t.name,eligible:!excluded.length,excluded,reasons,features,businessScore:round(businessScore),score:round(businessScore),weeklyJobs:weekly,expectedProfit:round(expectedProfit),travelMinutes:travel??null,durationMinutes:duration,historyCount:sample,profileVersion:record?.updated_at,slot:{date:slot.date,start:Math.round(start),end:Math.round(start+duration)},type,zip};
 });
 const eligible=candidates.filter(c=>c.eligible),best=Math.max(...eligible.map(c=>c.businessScore),0),total=Object.values(policy.weights).reduce((a,b)=>a+b,0)||1;
 for(const c of eligible){const closeEnough=c.businessScore>=best-policy.fairnessTolerance;c.fairnessApplied=closeEnough;c.score=round(c.businessScore*(1-policy.weights.fairness/total)+(closeEnough?c.features.fairness*policy.weights.fairness/total:0));}
 candidates.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.score-a.score||a.technician_id.localeCompare(b.technician_id));
 const winner=candidates.find(c=>c.eligible&&c.score>=policy.minScore);
 return {status:winner?'recommended':'held',reason:winner?`Best eligible business score. ${winner.fairnessApplied?'Weekly balance considered within the business tolerance.':''}`:eligible.length?'No candidate meets the minimum score.':'No technician currently meets the required conditions.',winner:winner||null,candidates,type,slot,zip};
}
