// Provider acceptance is not handset delivery. Queue claims are never blindly retried.
export function allowedOwnerPushEndpoint(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&((u.hostname==='fcm.googleapis.com'&&u.pathname.startsWith('/fcm/send/'))||(u.hostname==='updates.push.services.mozilla.com'&&u.pathname.startsWith('/wpush/'))||u.hostname==='web.push.apple.com');}catch{return false;}
}
export function ownerPushPayload(row){
 return {kind:'owner_lead',event_id:row.id,expires_at:row.expires_at,title:'New EZfix lead',body:'A new lead is ready for review. Open EZfix to see the details.'};
}
export async function deliverOwnerLeadPush(row,{eligible,send,finish,removeSubscription,now=Date.now}){
 if(!Number.isFinite(Date.parse(row.expires_at))||Date.parse(row.expires_at)<=now()){await finish(row.id,'expired');return 'expired';}
 if(!await eligible(row)){await finish(row.id,'skipped');return 'skipped';}
 if(!allowedOwnerPushEndpoint(row.subscription?.endpoint)){await finish(row.id,'failed');return 'failed';}
 let status;
 try{await send(row.subscription,JSON.stringify(ownerPushPayload(row)),Math.max(1,Math.ceil((Date.parse(row.expires_at)-now())/1000)));status='accepted';}
 catch(error){const code=Number(error?.statusCode);status=[400,401,403,404,410,413].includes(code)?'failed':'unconfirmed';if([404,410].includes(code))await removeSubscription(row.subscription_id);}
 await finish(row.id,status);return status;
}
export async function handleOwnerLeadPush(req,{secret,claim,deliver}){
 if(req.method!=='POST')return Response.json({ok:false,error:'Method not allowed'},{status:405});
 if(!secret||req.headers.get('x-ezfix-cron-token')!==secret)return Response.json({ok:false,error:'Unauthorized'},{status:401});
 try{
  const rows=await claim();const counts={};
  for(let i=0;i<rows.length;i+=4){const states=await Promise.all(rows.slice(i,i+4).map(deliver));for(const state of states)counts[state]=(counts[state]||0)+1;}
  return Response.json({ok:true,processed:rows.length,states:counts});
 }catch{return Response.json({ok:false,error:'Owner alerts unavailable'},{status:500});}
}
