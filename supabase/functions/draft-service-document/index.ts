import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {draftInstructions,parseDocumentDraft} from '../_shared/service-document-draft.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return reply({ok:false,error:'Method not allowed'},405);
 try{
  const auth=req.headers.get('Authorization')||'',url=Deno.env.get('SUPABASE_URL')!;
  if(!auth.startsWith('Bearer '))return reply({ok:false,error:'Unauthorized'},401);
  const scoped=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}),{data:{user},error:authError}=await scoped.auth.getUser();
  if(authError||!user)return reply({ok:false,error:'Unauthorized'},401);
  const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}}),{data:member,error:me}=await db.from('team').select('id,status,role').eq('auth_user_id',user.id).maybeSingle();
  if(me||member?.status!=='active'||!['owner','admin','office','dispatcher','technician'].includes(member.role))return reply({ok:false,error:'Access denied'},403);
  const input=await req.json(),description=String(input.description||'').trim();if(!description||description.length>2500||!['invoice','estimate'].includes(input.type))return reply({ok:false,error:'Describe the service in up to 2500 characters.'},400);
  if(member.role==='technician'){
   const {data:job}=await db.from('jobs').select('id,technician_id,deleted_at').eq('id',String(input.job_id||'')).maybeSingle();
   if(!job||job.deleted_at||job.technician_id!==member.id)return reply({ok:false,error:'Assigned job required'},403);
  }
  const key=Deno.env.get('OPENAI_API_KEY');if(!key)return reply({ok:false,error:'Server AI connection is not configured.'},503);
  const {count,error:ce}=await db.from('audit_log').select('id',{head:true,count:'exact'}).eq('action','document_ai_generation').eq('created_by_team_id',member.id).gte('created_at',new Date(Date.now()-3600000).toISOString());if(ce)throw ce;
  if(member.role!=='owner'&&Number(count)>=20)return reply({ok:false,error:'Generation limit reached. Try again later.'},429);
  const {data:catalog,error:pe}=await db.from('products').select('id,name,details,rate,taxable').eq('active',true).limit(500);if(pe)throw pe;
  const {error:ae}=await db.from('audit_log').insert({id:crypto.randomUUID(),action:'document_ai_generation',summary:'Service document draft requested',entity_type:'jobs',entity_id:input.job_id||null,source:'app_client',created_by_team_id:member.id});if(ae)throw ae;
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',store:false,instructions:draftInstructions(),input:JSON.stringify({description,type:input.type,catalog}),text:{format:{type:'json_object'}},max_output_tokens:2200}),signal:AbortSignal.timeout(45000)});
  if(!res.ok)return reply({ok:false,error:'AI generation is temporarily unavailable. Your current document is unchanged.'},502);
  const result=await res.json(),text=(result.output||[]).flatMap((o:any)=>o.content||[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('');
  return reply({ok:true,...parseDocumentDraft(text,catalog||[])});
 }catch(e){console.error('Document draft failed',e);return reply({ok:false,error:'Could not prepare the draft. Your current document is unchanged.'},500);}
});
