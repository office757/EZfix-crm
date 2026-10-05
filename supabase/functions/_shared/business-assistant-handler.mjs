import {receiptInstructions,parseReceipt} from './business-assistant.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
export function createBusinessAssistant({createClient,env,fetch=globalThis.fetch}){return async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return reply({ok:false,error:'Method not allowed'},405);
 try{
  const auth=req.headers.get('Authorization')||'',url=env('SUPABASE_URL');
  if(!auth.startsWith('Bearer '))return reply({ok:false,error:'Sign in required.'},401);
  const scoped=createClient(url,env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await scoped.auth.getUser();if(authError||!user)return reply({ok:false,error:'Sign in required.'},401);
  const db=createClient(url,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const {data:member,error:me}=await db.from('team').select('id,role,status').eq('auth_user_id',user.id).maybeSingle();
  if(me||member?.status!=='active'||!['owner','admin','office','dispatcher','technician'].includes(member.role))return reply({ok:false,error:'Access denied.'},403);
  const max=12*1024*1024,length=Number(req.headers.get('content-length')||0);if(length>max)return reply({ok:false,error:'File is too large.'},413);
  // Stream-limit even requests without Content-Length before parsing multipart/JSON.
  const reader=req.body?.getReader(),chunks=[];let size=0;
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();return reply({ok:false,error:'File is too large.'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const parsed=new Request(req.url,{method:'POST',headers:req.headers,body:bytes});
  const multipart=req.headers.get('content-type')?.includes('multipart/form-data'),form=multipart?await parsed.formData():null;
  const input=form?{action:form.get('action'),job_id:form.get('job_id')}:await parsed.json();
  if(!['receipt','transcribe','geocode'].includes(input.action))return reply({ok:false,error:'Choose a supported action.'},400);
  if(member.role==='technician'){
   if(input.action==='receipt')return reply({ok:false,error:'Office access required.'},403);
   if(input.action==='transcribe'){const {data:job}=await db.from('jobs').select('id,technician_id,deleted_at').eq('id',String(input.job_id||'')).maybeSingle();if(!job||job.deleted_at||job.technician_id!==member.id)return reply({ok:false,error:'An assigned job is required.'},403);}
  }
  const {count,error:ce}=await db.from('audit_log').select('id',{head:true,count:'exact'}).eq('action','business_assistant_request').eq('created_by_team_id',member.id).gte('created_at',new Date(Date.now()-3600000).toISOString());if(ce)throw ce;
  if(Number(count)>=40)return reply({ok:false,error:'Hourly limit reached. Try again later.'},429);
  const {error:ae}=await db.from('audit_log').insert({id:crypto.randomUUID(),action:'business_assistant_request',summary:'Business assistant: '+input.action,source:'app_client',created_by_team_id:member.id});if(ae)throw ae;
  if(input.action==='geocode'){
   if(!Array.isArray(input.job_ids)||input.job_ids.length<1||input.job_ids.length>20||input.job_ids.some((x)=>typeof x!=='string'))return reply({ok:false,error:'Choose between 1 and 20 route stops.'},400);
   let query=db.from('jobs').select('id,customer_id,scheduled_date,status,deleted_at,app_data').in('id',input.job_ids).is('deleted_at',null);if(member.role==='technician')query=query.eq('technician_id',member.id);
   const {data:jobs,error:je}=await query;if(je)throw je;if(jobs?.length!==new Set(input.job_ids).size)return reply({ok:false,error:'One or more jobs are not available.'},403);
   const {data:customers,error:cu}=await db.from('customers').select('id,address,deleted_at').in('id',jobs.map(j=>j.customer_id).filter(Boolean)).is('deleted_at',null);if(cu)throw cu;
   const locations=[];
   // Do not trust client addresses or fetch client URLs. Only geocode stored job addresses.
   for(let start=0;start<jobs.length;start+=4)await Promise.all(jobs.slice(start,start+4).map(async j=>{
    const address=j.app_data?.serviceAddress||j.app_data?.service_address||customers?.find(c=>c.id===j.customer_id)?.address;let point=null;
    if(address&&String(address).length<=500){try{const u=new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');u.search=new URLSearchParams({address,benchmark:'Public_AR_Current',format:'json'}).toString();const response=await fetch(u,{signal:AbortSignal.timeout(7000)});const result=response.ok?await response.json():null;const matches=result?.result?.addressMatches||[];if(matches.length===1){const c=matches[0].coordinates;if(Number.isFinite(c?.x)&&Number.isFinite(c?.y)&&Math.abs(c.x)<=180&&Math.abs(c.y)<=90)point={lat:c.y,lng:c.x};}}catch{/* Unmatched addresses remain explicit, without fabricated coordinates. */}}
    locations.push({job_id:j.id,point});
   }));
   return reply({ok:true,locations});
  }
  const key=env('OPENAI_API_KEY');if(!key)return reply({ok:false,error:'The server AI connection is not configured.'},503);
  if(input.action==='transcribe'){
   const file=form?.get('file');if(!(file instanceof File)||file.size<100||file.size>8*1024*1024||!/^audio\/(webm|mp4|mpeg|mp3|wav|x-wav|ogg|m4a|x-m4a)(;|$)|^video\/(webm|mp4)$/.test(file.type))return reply({ok:false,error:'Use an MP3, MP4, WAV, OGG or WebM recording up to 8 MB.'},400);
   const body=new FormData();body.append('file',file,file.name);body.append('model','gpt-4o-mini-transcribe');body.append('response_format','json');body.append('prompt','Garage door service notes. Torsion springs, rollers, cables, opener, hinges, lubrication. Transcribe only spoken words in the original language.');
   const res=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+key},body,signal:AbortSignal.timeout(45000)});if(!res.ok)return reply({ok:false,error:'Transcription is temporarily unavailable. Your notes are unchanged.'},502);
   const result=await res.json(),text=String(result.text||'').trim();return reply({ok:true,text:text.slice(0,2500),truncated:text.length>2500});
  }
  if(typeof input.image!=='string'||input.image.length>11*1024*1024||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(input.image))return reply({ok:false,error:'Use a JPEG, PNG or WebP receipt photo up to 8 MB.'},400);
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',store:false,instructions:receiptInstructions(),input:[{role:'user',content:[{type:'input_text',text:'Extract the supplier receipt as JSON for human review.'},{type:'input_image',image_url:input.image,detail:'high'}]}],text:{format:{type:'json_object'}},max_output_tokens:1500}),signal:AbortSignal.timeout(45000)});
  if(!res.ok)return reply({ok:false,error:'Receipt scanning is temporarily unavailable. Your receipt is unchanged.'},502);
  const result=await res.json(),text=(result.output||[]).flatMap((o)=>o.content||[]).filter((c)=>c.type==='output_text').map((c)=>c.text).join('');
  return reply({ok:true,receipt:parseReceipt(text)});
 }catch{console.error('Business assistant request failed');return reply({ok:false,error:'Could not complete the request. Please retry.'},500);}
};}
