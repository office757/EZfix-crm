import { createClient } from "npm:@supabase/supabase-js@2.99.2";
import webpush from "npm:web-push@3.6.7";
import { deliverOwnerLeadPush, handleOwnerLeadPush } from "../_shared/owner-lead-push.mjs";
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const checked=(r:any)=>{if(r.error)throw new Error('Notification storage unavailable');return r.data;};
Deno.serve((req:Request)=>handleOwnerLeadPush(req,{
 secret:Deno.env.get('EZFIX_CALL_SYNC_CRON_TOKEN')||'',
 claim:async()=>checked(await db.rpc('service_claim_owner_payment_push'))||[],
 deliver:async(row:any)=>deliverOwnerLeadPush({...row,kind:'owner_payment'},{
  eligible:async(r:any)=>{
   const [member,lead,sub]=await Promise.all([
    db.from('team').select('id').eq('id',r.team_id).eq('role','owner').eq('status','active').not('auth_user_id','is',null).maybeSingle(),
    db.from('invoices').select('id,payments').eq('id',r.invoice_id).is('deleted_at',null).maybeSingle(),
    db.from('push_subscriptions').select('id').eq('id',r.subscription_id).eq('team_id',r.team_id).maybeSingle()
   ]);const invoice=checked(lead);return !!(checked(member)&&checked(sub)&&invoice&&(invoice.payments||[]).some((p:any)=>(p.squarePaymentId||p.externalPaymentId||p.id)===r.payment_key&&Number(p.appliedAmount??p.amount)>0&&!['refund','adjustment'].includes(String(p.type||'').toLowerCase())&&['','completed','paid','succeeded','payment'].includes(String(p.status||'').toLowerCase())));
  },
  send:async(subscription:any,payload:string,ttl:number)=>{
   const config=checked(await db.rpc('service_push_config'));
   if(!config?.public_key||!config?.private_key)throw new Error('Push configuration unavailable');
   await webpush.sendNotification(subscription,payload,{TTL:ttl,urgency:'high',timeout:6000,vapidDetails:{subject:'mailto:office@ezfixgaragedoorsinc.com',publicKey:config.public_key,privateKey:config.private_key}});
  },
  finish:async(id:string,status:string)=>{checked(await db.from('owner_payment_push_queue').update({status,completed_at:new Date().toISOString()}).eq('id',id).eq('status','sending'));},
  removeSubscription:async(id:string)=>{checked(await db.from('push_subscriptions').delete().eq('id',id));}
 })
}));
