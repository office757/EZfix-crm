import { randomUUID } from 'node:crypto';
export class Relay {
 constructor(bridge, transport, qrImage){
  this.bridge=bridge;this.transport=transport;this.qrImage=qrImage;this.busy=false;
  bridge.db.exec('CREATE TABLE IF NOT EXISTS relay_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  const existing=bridge.db.prepare("SELECT value FROM relay_state WHERE key='worker_id'").get();
  this.workerId=existing?.value||randomUUID();
  bridge.db.prepare("INSERT OR IGNORE INTO relay_state(key,value) VALUES('worker_id',?)").run(this.workerId);
 }
 async tick(){
  if(this.busy)return;this.busy=true;
  try{
   const after=Number(this.bridge.db.prepare("SELECT value FROM relay_state WHERE key='cursor'").get()?.value||0);
   const events=this.bridge.events(after).slice(0,10);
   const reply=await this.transport({action:'sync',worker_id:this.workerId,state:this.bridge.state,qr_data_url:this.bridge.qr?await this.qrImage(this.bridge.qr):null,events});
   if(events.length){
    const end=events.at(-1).seq;
    if(reply.accepted_through!==end)throw new Error('Relay did not acknowledge the complete event batch');
    this.bridge.db.prepare("INSERT INTO relay_state(key,value) VALUES('cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(end));
   }
   if(reply.command){
    // Cloud only returns explicit office-created requests. Inbound text is never a command.
    const result=await this.bridge.send(reply.command);
    if(['submitted','unconfirmed','not_registered'].includes(result.state)){
     await this.transport({action:'result',worker_id:this.workerId,request_id:reply.command.request_id,state:result.state,provider_id:result.provider_id||null});
    }
   }
  }finally{this.busy=false;}
 }
}
export function relayTransport(endpoint,token,fetchImpl=fetch){
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||token.length<32)throw new Error('HTTPS relay URL and a private relay token are required');
 return async body=>{
  const response=await fetchImpl(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-wa-bridge-key':token},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('CRM relay request failed ('+response.status+')');
  const result=await response.json();if(result?.ok!==true)throw new Error('CRM relay rejected request');return result;
 };
}
