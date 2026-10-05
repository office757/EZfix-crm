import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {buildPayStatement,validatePeriod} from '../_shared/technician-payroll.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return reply({ok:false,error:'Method not allowed'},405);
 try{
  const auth=req.headers.get('Authorization')||'',url=Deno.env.get('SUPABASE_URL')!;if(!auth.startsWith('Bearer '))return reply({ok:false,error:'Unauthorized'},401);
  const scoped=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}),{data:{user},error:ae}=await scoped.auth.getUser();if(ae||!user)return reply({ok:false,error:'Unauthorized'},401);
  const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}}),{data:actor,error:me}=await db.from('team').select('id,role,status').eq('auth_user_id',user.id).maybeSingle();
  if(me||actor?.status!=='active'||!['owner','admin','office','dispatcher'].includes(actor.role))return reply({ok:false,error:'Office access required'},403);
  const input=await req.json();if(!['preview','create'].includes(input.action))return reply({ok:false,error:'Invalid action'},400);
  if(input.action==='create'&&!['owner','admin'].includes(actor.role))return reply({ok:false,error:'Owner access required to save a payable statement'},403);
  const from=String(input.from||''),to=String(input.to||'');validatePeriod(from,to);
  const {data:tech,error:te}=await db.from('team').select('id,name,commission_percent').eq('id',String(input.technician_id||'')).maybeSingle();if(te||!tech)return reply({ok:false,error:'Technician not found'},404);
  if(input.action==='create'){
   const {data:existing}=await db.from('technician_pay_statements').select('*').eq('id',String(input.request_id||'')).maybeSingle();
   if(existing){if(existing.technician_id!==tech.id||existing.period_from!==from||existing.period_to!==to)return reply({ok:false,error:'Request ID already used'},409);return reply({ok:true,statement:existing});}
  }
  const {data:jobs,error:je}=await db.from('jobs').select('id,technician_id,customer_name,title,status,scheduled_date,material_cost,app_data,deleted_at').eq('technician_id',tech.id).gte('scheduled_date',from).lt('scheduled_date',to).is('deleted_at',null).order('scheduled_date').order('id').limit(1001);if(je)throw je;if((jobs||[]).length>1000)throw new Error('Choose a shorter period (more than 1000 jobs).');
  const ids=(jobs||[]).map(j=>j.id);let invoices:any[]=[],claimed:any[]=[];
  // Query small chunks to avoid URL limits and Supabase's default 1000-row cap.
  for(let n=0;n<ids.length;n+=40){const chunk=ids.slice(n,n+40);const [ir,cr]=await Promise.all([db.from('invoices').select('id,number,job_id,items,payments,tax_rate,discount,deleted_at').in('job_id',chunk).is('deleted_at',null).order('id').limit(1001),db.from('technician_pay_statement_jobs').select('job_id').in('job_id',chunk)]);if(ir.error)throw ir.error;if(cr.error)throw cr.error;if((ir.data||[]).length>1000)throw new Error('Too many invoices. Choose a shorter period.');invoices.push(...ir.data||[]);claimed.push(...cr.data||[]);}
  const details=buildPayStatement({technician:tech,jobs:jobs||[],invoices,claimed:claimed.map(c=>c.job_id),from,to,rate:input.rate,cashRetained:input.cash_retained});
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(details))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(input.action==='preview')return reply({ok:true,details,fingerprint});
  if(input.expected_details!==fingerprint)return reply({ok:false,error:'Job or payment figures changed. Preview the calculation again before saving.'},409);
  if(!details.rows.length)return reply({ok:false,error:'No completed, fully paid, unsettled jobs in this period.'},400);
  const {data:saved,error:se}=await db.rpc('service_save_technician_pay_statement',{p_id:input.request_id,p_actor:actor.id,p_technician:tech.id,p_from:from,p_to:to,p_details:details});if(se)return reply({ok:false,error:'Statement could not be saved. Another statement may already include these jobs. Refresh the preview.'},409);
  return reply({ok:true,statement:saved});
 }catch(e){return reply({ok:false,error:e instanceof Error?e.message:'Payroll could not be loaded.'},400);}
});
