import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({ok:false,error:'Method not allowed'},405);
 try{
  const body=await req.json().catch(()=>({}));
  const diagnostic=body.validate_only===true&&!!Deno.env.get('EZFIX_CALL_SYNC_CRON_TOKEN')&&req.headers.get('x-ezfix-cron-token')===Deno.env.get('EZFIX_CALL_SYNC_CRON_TOKEN');
  if(!diagnostic){
   const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return reply({ok:false,error:'Unauthorized'},401);
   const userDb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
   const {data:{user},error}=await userDb.auth.getUser();if(error||!user)return reply({ok:false,error:'Unauthorized'},401);
   const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
   const {data:member,error:me}=await db.from('team').select('role,status').eq('auth_user_id',user.id).maybeSingle();
   if(me||member?.status!=='active'||member?.role!=='owner')return reply({ok:false,error:'Owner access required'},403);
  }
  const token=Deno.env.get('SQUARE_ACCESS_TOKEN'),location=Deno.env.get('SQUARE_LOCATION_ID');
  const configured=!!token&&!!location;
  if(!configured)return reply({ok:true,configured:false,bank_accounts:[],payouts:[],ai_configured:!!Deno.env.get('OPENAI_API_KEY')});
  const get=async(path:string)=>{
   const res=await fetch('https://connect.squareup.com/v2/'+path,{headers:{Authorization:'Bearer '+token,'Square-Version':'2026-09-16'},signal:AbortSignal.timeout(15000)});
   const data=await res.json();if(!res.ok)throw new Error('Square reporting access failed ('+res.status+'). Check bank and payout permissions.');return data;
  };
  const [bankResult,payoutResult]=await Promise.allSettled([get('bank-accounts?location_id='+encodeURIComponent(location!)+'&limit=100'),get('payouts?location_id='+encodeURIComponent(location!)+'&limit=20&sort_order=DESC')]);
  const banks=bankResult.status==='fulfilled'?(bankResult.value.bank_accounts||[]).map((a:any)=>({id:a.id,name:a.bank_name||'Bank account',suffix:a.account_number_suffix||'',status:a.status,currency:a.currency})):[];
  const payouts=payoutResult.status==='fulfilled'?(payoutResult.value.payouts||[]).map((p:any)=>({id:p.id,status:p.status,amount:Number(p.amount_money?.amount)||0,currency:p.amount_money?.currency||p.amount_money?.currency_code||'USD',created_at:p.created_at,arrival_date:p.arrival_date,destination_id:p.destination?.id})):[];
  const errors=[bankResult,payoutResult].filter(x=>x.status==='rejected').map((x:any)=>x.reason.message);
  if(diagnostic){
   const key=Deno.env.get('OPENAI_API_KEY');
   const checkModel=async(model:string)=>{if(!key)return false;try{return (await fetch('https://api.openai.com/v1/models/'+encodeURIComponent(model),{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)})).ok;}catch{return false;}};
   const [ai_text_available,ai_image_available]=await Promise.all([checkModel(Deno.env.get('OPENAI_SOCIAL_TEXT_MODEL')||'gpt-4.1-mini'),checkModel(Deno.env.get('OPENAI_SOCIAL_IMAGE_MODEL')||'gpt-image-1')]);
   return reply({ok:true,configured,bank_names:banks.map((b:any)=>b.name),ai_text_available,ai_image_available,bank_count:banks.length,verified_banks:banks.filter((b:any)=>b.status==='VERIFIED').length,payout_count:payouts.length,errors,ai_configured:!!Deno.env.get('OPENAI_API_KEY')});
  }
  return reply({ok:true,configured,bank_accounts:banks,payouts,has_more:payoutResult.status==='fulfilled'&&!!payoutResult.value.cursor,errors,checked_at:new Date().toISOString(),payroll_transfer_enabled:false});
 }catch{return reply({ok:false,error:'Could not read provider connection status.'},503);}
});
