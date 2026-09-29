/* Manual office WhatsApp inbox; provider credentials stay on the server. */
(function(){
'use strict';
const allowed=()=>!isTechnicianView()&&['owner','admin','dispatcher','office'].includes(CURRENT_TEAM_MEMBER?.role);
const call=async body=>{const {data,error}=await SB.functions.invoke('whatsapp-linked-device',{body});if(error||!data?.ok)throw new Error(data?.error||'WhatsApp connection unavailable');return data;};
const labels={not_configured:'Host setup required',offline:'Host offline',starting:'Starting',awaiting_qr:'Scan QR to connect',loading:'Connecting',ready:'Connected',authentication_failed:'Pairing required',disconnected:'Disconnected',startup_failed:'Host could not start',queued:'Queued',processing:'Sending — awaiting result',submitted:'Submitted — delivery not confirmed',unconfirmed:'Outcome unknown — check WhatsApp',not_registered:'Recipient not registered',cancelled:'Cancelled'};
const phone=chat=>/^\d+@c\.us$/.test(chat)?'+'+chat.split('@')[0]:'';
const norm=v=>{const d=String(v||'').replace(/\D/g,'');return d.length===10?'1'+d:d;};
let version=0;
function matched(number){
 if(!number)return null;const matches=[];
 for(const col of ['leads','customers'])for(const row of STORE[col]||[])if(norm(row.phone)===norm(number))matches.push({col,row});
 return matches.length===1?matches[0]:null;
}
const arg=v=>esc(JSON.stringify(String(v||'')));
window.WhatsAppLinked={
 async open(){
  if(!allowed())return;
  const current=++version;
  showModal({title:'WhatsApp',wide:true,body:'<div id="wa_linked_panel" aria-live="polite">Loading connection and recent messages…</div>'});
  try{
   const [status,data]=await Promise.all([call({action:'status'}),call({action:'messages'})]);
   const el=document.getElementById('wa_linked_panel');if(!el||current!==version)return;
   const ack=new Map();for(const e of data.events.filter(e=>e.payload.type==='ack')){const p=e.payload;ack.set(p.id,Math.max(ack.get(p.id)??-1,p.ack));}
   const contacts=new Map();for(const e of data.events.filter(e=>e.payload.type==='contact'))if(!contacts.has(e.payload.chat_id))contacts.set(e.payload.chat_id,e.payload.phone_e164);
   const messages=data.events.filter(e=>e.payload.type==='message').reverse();
   el.innerHTML=`<div class="dispatch-actions"><strong>${esc(labels[status.state]||status.state)}</strong><button class="btn" onclick="WhatsAppLinked.open()">Refresh</button>${CURRENT_TEAM_MEMBER?.role==='owner'?'<button class="btn" onclick="WhatsAppLinked.pair()">Connect account</button>':''}<button class="btn btn-primary" ${status.state==='ready'?'':'disabled'} onclick="WhatsAppLinked.compose()">New message</button></div><p class="muted">Manual office messages. Ashley automatic replies are off. Recent messages appear here after the host connects.</p>${messages.length?messages.map(({payload:p})=>{const n=phone(p.chat_id)||contacts.get(p.chat_id)||'',match=matched(n),a=ack.get(p.id),delivery=p.direction==='outbound'?(a>=3?'Read':a>=2?'Delivered':a===-1?'Delivery failed':'Delivery not confirmed'):'';return `<article class="dispatch-card" style="margin-top:10px"><strong>${esc(match?.row.name||n||'WhatsApp contact (phone not verified)')}</strong><div class="muted">${p.direction==='inbound'?'Received':'Sent'} · ${esc(delivery)}</div><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(p.body)}</p><div class="dispatch-actions">${match?`<button class="btn btn-sm" onclick="closeModal();go(${arg(match.col)},${arg(match.row.id)})">Open ${match.col==='leads'?'lead':'customer'}</button>`:''}${n?`<button class="btn btn-sm" ${status.state==='ready'?'':'disabled'} onclick="WhatsAppLinked.compose(${arg(n)})">Reply</button>`:''}</div></article>`;}).join(''):'<p>No recent direct text messages.</p>'}<h4>Recent office sends</h4>${data.sends.map(s=>`<div class="kv"><span>${esc(s.to_phone)}</span><span>${esc(labels[s.state]||s.state)}</span></div>`).join('')||'<p>No office sends yet.</p>'}`;
  }catch(e){const el=document.getElementById('wa_linked_panel');if(el&&current===version)el.textContent=e.message;}
 },
 async pair(){
  if(CURRENT_TEAM_MEMBER?.role!=='owner'||!allowed())return;
  try{const r=await call({action:'qr'});showModal({title:'Connect WhatsApp account',body:r.qr_data_url&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.qr_data_url)?`<p>On the intended WhatsApp account, open Linked devices → Link a device and scan this code.</p><img src="${r.qr_data_url}" alt="WhatsApp pairing QR" style="max-width:280px;width:100%"><p>Use Refresh QR if the code expires.</p><button class="btn" onclick="WhatsAppLinked.pair()">Refresh QR</button>`:'<p>No current QR is available. Start the persistent WhatsApp host, then refresh. An already connected account does not need another QR.</p>'});}catch(e){toast(e.message,true);}
 },
 compose(to=''){
  if(!allowed())return;
  const id=crypto.randomUUID();let frozen=null;
  showModal({title:'New WhatsApp message',body:`<label class="field"><span class="lbl">Recipient phone</span><input id="wa_linked_to" type="tel" value="${esc(to)}" placeholder="+15085550123"></label><label class="field"><span class="lbl">Message</span><textarea id="wa_linked_body" rows="6" maxlength="4096"></textarea></label><p class="muted">Sends from the account linked to this CRM. Queued or submitted does not mean delivered.</p>`,onSave:async()=>{
   if(!allowed())return toast('Office access required',true);
   const recipient=document.getElementById('wa_linked_to').value.trim(),body=document.getElementById('wa_linked_body').value;
   if(!/^\+[1-9]\d{7,14}$/.test(recipient)||!body.trim())return toast('Enter an international phone number and a message.',true);
   const payload={action:'send',request_id:id,to:recipient,body};
   if(frozen&&JSON.stringify(frozen)!==JSON.stringify(payload))return toast('The previous send outcome is not confirmed. Check the inbox before composing another message.',true);
   frozen=payload;
   try{const r=await call(payload);closeModal();toast(labels[r.state]||r.state);await WhatsAppLinked.open();}catch(e){toast(e.message+' Retry keeps the same request ID.',true);}
  }});document.getElementById('modalSaveBtn').textContent='Send WhatsApp message';
 }
};
const base=renderCommunications;
renderCommunications=function(content,actions){base(content,actions);if(allowed())actions.insertAdjacentHTML('beforeend','<button class="btn" onclick="WhatsAppLinked.open()">WhatsApp</button>');};
})();
