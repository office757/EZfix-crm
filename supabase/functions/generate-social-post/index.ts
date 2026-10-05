import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {socialInstructions,parseSocialDraft,imagePrompt} from '../_shared/social-content.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({ok:false,error:'Method not allowed'},405);
 try{
  const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return reply({ok:false,error:'Unauthorized'},401);
  const url=Deno.env.get('SUPABASE_URL')!,scoped=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user},error}=await scoped.auth.getUser();if(error||!user)return reply({ok:false,error:'Unauthorized'},401);
  const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:member,error:me}=await db.from('team').select('id,role,status').eq('auth_user_id',user.id).maybeSingle();
  if(me||member?.status!=='active'||!['owner','admin','office','dispatcher','marketing_manager'].includes(member.role))return reply({ok:false,error:'Office access required'},403);
  const key=Deno.env.get('OPENAI_API_KEY');if(!key)return reply({ok:false,configured:false,error:'AI generation needs the server AI connection. Your draft has not changed.'},503);
  const input=await req.json();
  if(member.role==='marketing_manager'||input.campaign_id){
   const {data:campaign,error:campError}=await db.from('content_campaigns').select('id,created_by,status').eq('id',String(input.campaign_id||'')).maybeSingle();
   if(campError||!campaign||campaign.status!=='active'||(member.role==='marketing_manager'&&campaign.created_by!==member.id))return reply({ok:false,error:'Your active campaign is required.'},403);
  }
  const topic=String(input.topic||'').trim(),notes=String(input.notes||'').trim(),platform=String(input.platform||'google_business');
  if(!topic||topic.length>250||notes.length>1500||!['google_business','instagram','facebook'].includes(platform))return reply({ok:false,error:'Enter a topic and select a supported platform.'},400);
  const {count,error:ce}=await db.from('audit_log').select('id',{head:true,count:'exact'}).eq('action','social_ai_generation').eq('created_by_team_id',member.id).gte('created_at',new Date(Date.now()-3600000).toISOString());
  if(ce)throw ce;if(member.role!=='owner'&&Number(count)>=6)return reply({ok:false,error:'Hourly generation limit reached. Use an existing draft or try later.'},429);
  const {error:le}=await db.from('audit_log').insert({id:crypto.randomUUID(),action:'social_ai_generation',summary:'Social post generation requested',entity_type:'social_posts',source:'app_client',created_by_team_id:member.id,details:{platform,image_requested:input.generate_image===true}});if(le)throw le;
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:Deno.env.get('OPENAI_SOCIAL_TEXT_MODEL')||'gpt-4.1-mini',store:false,instructions:socialInstructions(platform),input:JSON.stringify({topic,notes}),text:{format:{type:'json_object'}},max_output_tokens:1200}),signal:AbortSignal.timeout(45000)});
  if(!res.ok)return reply({ok:false,error:'AI text generation is unavailable. Your current draft has been kept.'},502);
  const result=await res.json(),text=(result.output||[]).flatMap((o:any)=>o.content||[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('');
  const draft=parseSocialDraft(text,platform);let photo=null,image_error=null;
  if(input.generate_image===true){
   try{
    const imageRes=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:Deno.env.get('OPENAI_SOCIAL_IMAGE_MODEL')||'gpt-image-1',prompt:imagePrompt(topic),n:1,size:'1024x1024',quality:'medium',output_format:'jpeg'}),signal:AbortSignal.timeout(90000)});
    if(!imageRes.ok)throw new Error('Image generation unavailable');const image=await imageRes.json();const b64=image.data?.[0]?.b64_json;if(!b64)throw new Error('No image returned');
    const binary=atob(b64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),path='social/generated/'+crypto.randomUUID()+'.jpg';
    const {error:ue}=await db.storage.from('crm-assets').upload(path,bytes,{contentType:'image/jpeg',upsert:false});if(ue)throw ue;
    const {data:link,error:se}=await db.storage.from('crm-assets').createSignedUrl(path,3600);if(se)throw se;
    photo={id:'crm-assets/'+path,path,url:link.signedUrl,label:'AI illustration: '+topic,aiGenerated:true};
   }catch{image_error='The post is ready, but image generation failed. Retry with a new image or choose a project photo.';}
  }
  return reply({ok:true,...draft,photo,image_error});
 }catch(e){return reply({ok:false,error:e instanceof SyntaxError?'AI returned an invalid draft. Please retry.':'Generation could not complete. Your saved posts are unchanged.'},500);}
});
