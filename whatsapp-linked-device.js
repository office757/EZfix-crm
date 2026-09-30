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
let cache=null,connection='starting',loading=false,loadError='',selectedChat=null,sending=false;
const drafts=new Map(),attempts=new Map();
function captureDraft(){const input=document.getElementById('wa_reply_body');if(input&&selectedChat)drafts.set(selectedChat,input.value);}
function threads(){
 const events=cache?.events||[],contacts=new Map(),acks=new Map(),groups=new Map();
 for(const {payload:p} of events){
  if(p.type==='contact')contacts.set(p.chat_id,p.phone_e164);
  if(p.type==='ack')acks.set(p.id,Math.max(acks.get(p.id)??-1,p.ack));
 }
 for(const {payload:p} of events){if(p.type!=='message')continue;
  if(!groups.has(p.chat_id)){const number=phone(p.chat_id)||contacts.get(p.chat_id)||'',match=matched(number);groups.set(p.chat_id,{chat:p.chat_id,number,match,name:match?.row.name||number||'WhatsApp contact (phone not verified)',messages:[]});}
  groups.get(p.chat_id).messages.push({...p,ack:acks.get(p.id)});
 }
 for(const thread of groups.values())thread.messages.sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
 return [...groups.values()].sort((a,b)=>(b.messages.at(-1)?.timestamp||0)-(a.messages.at(-1)?.timestamp||0));
}
const when=p=>p.timestamp?new Date(p.timestamp*1000).toLocaleString():'';
const delivery=p=>p.direction==='inbound'?'Received':p.ack>=3?'Read':p.ack>=2?'Delivered':p.ack===-1?'Delivery failed':'Sent · delivery not confirmed';
function paintInbox(){
 const el=document.getElementById('wa_linked_panel');
 if(!el||!allowed()||searchTerms.commFilter!=='whatsapp')return;
 if(document.activeElement?.id==='wa_reply_body'&&!sending)return;
 captureDraft();
 const q=String(searchTerms.commSearch||'').toLowerCase().trim(),all=threads();
 const visible=all.filter(t=>!q||[t.name,...t.messages.map(m=>m.body)].join(' ').toLowerCase().includes(q));
 const selected=all.find(t=>t.chat===selectedChat);
 const list=visible.map(t=>{const last=t.messages.at(-1);return `<button type="button" class="kv clickable" style="width:100%;text-align:left;padding:12px 18px;grid-template-columns:100px 1fr;${t.chat===selectedChat?'background:var(--paper-2)':''}" onclick="WhatsAppLinked.select(${arg(t.chat)})"><span class="k">${esc(when(last))}</span><span><strong>${esc(t.name)}</strong><br><span class="muted">${esc(last.body.slice(0,100))}</span></span></button>`;}).join('')||'<div class="panel-body pad muted">No matching WhatsApp conversations.</div>';
 const detail=selected?`<div class="panel-body pad"><button class="btn btn-sm" onclick="WhatsAppLinked.back()">← Back to list</button><h3>${esc(selected.name)}</h3>${selected.match?`<button class="btn btn-sm" onclick="go(${arg(selected.match.col)},${arg(selected.match.row.id)})">Open ${selected.match.col==='leads'?'lead':'customer'}</button>`:''}<div class="ashley-message-thread" style="max-height:380px;overflow:auto;display:flex;flex-direction:column;gap:8px;margin:14px 0">${selected.messages.map(p=>`<div class="ashley-message-bubble ${p.direction==='outbound'?'is-outbound':'is-inbound'}" style="align-self:${p.direction==='outbound'?'flex-end':'flex-start'};max-width:85%;padding:10px 14px;border-radius:12px;background:${p.direction==='outbound'?'var(--orange)':'var(--paper-2)'};color:${p.direction==='outbound'?'#201400':'inherit'}"><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(p.body)}</div><div style="font-size:11px;margin-top:4px">${esc(when(p))} · ${esc(delivery(p))}</div></div>`).join('')}</div>${selected.number?`<label class="field"><span class="lbl">Reply to ${esc(selected.number)}</span><textarea id="wa_reply_body" rows="3" maxlength="4096" placeholder="Type a reply…" oninput="WhatsAppLinked.draft(this.value)" ${sending?'disabled':''}>${esc(drafts.get(selected.chat)||'')}</textarea></label><button class="btn btn-primary" onclick="WhatsAppLinked.reply()" ${sending||connection!=='ready'?'disabled':''}>${sending?'Sending…':'Send WhatsApp message'}</button>`:'<p class="muted">A verified phone number is required to reply.</p>'}</div>`:'<div class="panel-body pad muted" style="padding:40px 18px;text-align:center">Select a WhatsApp conversation to see messages</div>';
 el.innerHTML=`<div class="toolbar" style="margin-bottom:12px;gap:8px;flex-wrap:wrap"><strong>${esc(labels[connection]||connection)}</strong><button class="btn btn-sm" onclick="WhatsAppLinked.refresh()" ${loading?'disabled':''}>${loading?'Refreshing…':'Refresh'}</button>${CURRENT_TEAM_MEMBER?.role==='owner'?'<button class="btn btn-sm" onclick="WhatsAppLinked.pair()">Connect account</button>':''}<button class="btn btn-primary" onclick="WhatsAppLinked.compose()" ${connection==='ready'?'':'disabled'}>New message</button></div>${loadError?`<p role="alert">${esc(loadError)}</p>`:''}${!cache?'<p>Loading WhatsApp conversations…</p>':`<div class="two-col comm-split${selected?' comm-mobile-detail':''}"><div class="panel"><div class="panel-body">${list}</div></div><div class="panel comm-detail-pane">${detail}</div></div><details style="margin-top:12px"><summary>Recent office sends</summary>${(cache.sends||[]).map(s=>`<div class="kv"><span>${esc(s.to_phone)}</span><span>${esc(labels[s.state]||s.state)}</span></div>`).join('')||'<p>No office sends yet.</p>'}</details>`}`;
}
async function loadInbox(){
 if(!allowed()||loading)return;
 loading=true;const current=++version,member=CURRENT_TEAM_MEMBER;loadError='';
 try{const [status,data]=await Promise.all([call({action:'status'}),call({action:'messages'})]);if(current!==version||!allowed()||CURRENT_TEAM_MEMBER!==member)return;connection=status.state;cache=data;}
 catch(e){loadError=e.message;}
 finally{loading=false;paintInbox();}
}
window.WhatsAppLinked={
 async open(){
  if(!allowed())return;
  searchTerms.commFilter='whatsapp';searchTerms.commSelected=null;
  if(route.page==='receptionist'){receptionistState.subview='whatsapp';render();}else go('communications');
  await loadInbox();
 },
 async refresh(){if(allowed())await loadInbox();},
 select(chat){if(!allowed())return;captureDraft();selectedChat=chat;render();},
 back(){captureDraft();selectedChat=null;render();},
 draft(value){if(selectedChat)drafts.set(selectedChat,value);},
 async reply(){
  if(!allowed()||sending||!selectedChat)return;
  const chat=selectedChat,thread=threads().find(t=>t.chat===chat),to=thread?.number;
  const body=(document.getElementById('wa_reply_body')?.value||drafts.get(chat)||'').trim();
  if(!to||!body)return toast('Enter a message for a verified phone number.',true);
  const existing=attempts.get(chat);
  if(existing&&(existing.to!==to||existing.body!==body))return toast('Check the previous send outcome before changing and resending this message.',true);
  const payload=existing||{action:'send',request_id:crypto.randomUUID(),to,body};
  attempts.set(chat,payload);sending=true;captureDraft();paintInbox();
  try{const result=await call(payload);drafts.delete(chat);const input=document.getElementById('wa_reply_body');if(input&&selectedChat===chat)input.value='';attempts.delete(chat);toast(labels[result.state]||result.state);await loadInbox();}
  catch(e){toast(e.message+' Retry keeps the same request ID.',true);}
  finally{sending=false;paintInbox();}
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
window.selectCommunicationChannel=function(channel){
 captureDraft();searchTerms.commFilter=channel;searchTerms.commSelected=null;render();
};
const emailDraft={to:'',subject:'',body:''};
window.captureCommunicationEmail=function(form){for(const key of ['to','subject','body'])emailDraft[key]=form.elements[key].value;};
window.sendCommunicationEmail=async function(form){
 if(!allowed()||form.dataset.sending==='true')return;
 const to=form.elements.to.value.trim(),subject=form.elements.subject.value.trim(),body=form.elements.body.value.trim();
 if(!to||!subject||!body)return toast('Enter an email, subject and message.',true);
 form.dataset.sending='true';const button=form.querySelector('button[type="submit"]');button.disabled=true;
 try{if(await tryGmailSend(to,subject,body)){for(const key of ['to','subject','body'])emailDraft[key]='';form.reset();await refreshCollection('auditLog');}}
 catch(e){toast(e.message||'Email could not be sent.',true);}
 finally{form.dataset.sending='false';button.disabled=false;}
};
renderCommunications=function(content,actions){
 base(content,actions);
 if(!allowed())return;
 const filter=searchTerms.commFilter||'all';
 actions.innerHTML='';
 const tabs=content.querySelector('.toolbar > div');
 if(tabs)tabs.innerHTML=[['all','▦','All'],['unread','🔔','Unread'],['email','✉️','Email'],['calls','☎️','Calls'],['sms','💬','SMS'],['whatsapp','🟢','WhatsApp']].map(([key,icon,label])=>`<button class="btn btn-sm ${filter===key?'btn-primary':''}" onclick="${key==='whatsapp'?'WhatsAppLinked.open()':`selectCommunicationChannel('${key}')`}"><span aria-hidden="true">${icon}</span> ${label}</button>`).join('')+'<button class="btn btn-sm" onclick="openCallAudioHistory()">🎧 Call History &amp; Audio</button>';
 if(filter==='email'){
  const split=content.querySelector('.comm-split');
  if(split)split.insertAdjacentHTML('beforebegin',`<form id="comm_email_compose" oninput="captureCommunicationEmail(this)" onsubmit="event.preventDefault();sendCommunicationEmail(this)" style="margin:12px 0"><label class="field"><span class="lbl">To</span><input name="to" value="${esc(emailDraft.to)}" type="email" required autocomplete="email"></label><label class="field"><span class="lbl">Subject</span><input name="subject" value="${esc(emailDraft.subject)}" required maxlength="200"></label><label class="field"><span class="lbl">Message</span><textarea name="body" required rows="4">${esc(emailDraft.body)}</textarea></label><button class="btn btn-primary" type="submit">✉️ Send email</button></form>`);
 }
 if(filter==='whatsapp'){
  const split=content.querySelector('.comm-split');
  if(split)split.outerHTML='<div id="wa_linked_panel" aria-live="polite"></div>';
  paintInbox();
  if(!cache&&!loading)void loadInbox();
 }
};
setInterval(()=>{if(allowed()&&(route.page==='communications'||(route.page==='receptionist'&&receptionistState.subview==='whatsapp'))&&searchTerms.commFilter==='whatsapp'&&!document.hidden)void loadInbox();},5000);
})();
