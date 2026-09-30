/* Human secretary workspace. Uses existing CRM records and delivery integrations. */
(function(){
'use strict';
const permitted=()=>canOperateOffice();
const arg=v=>esc(JSON.stringify(String(v||'')));
const platforms=[['instagram','Instagram'],['facebook','Facebook'],['google_business','Google Business Profile']];
const groups=[
 ['Communication & schedule',[['communications','Messages & email','Customer conversations and delivery history'],['calls','Calls & recordings','Call history, audio and transcripts'],['calendar','Calendar','Appointments and technician schedules'],['followups','Tasks & follow-ups','Assign work and track callbacks']]],
 ['Jobs & customers',[['jobs','Jobs & leads','Assign technicians and follow progress'],['customers','Customers','Contact details and service history']]],
 ['Finance',[['estimates','Estimates','Prepare quotes after assigning a technician'],['invoices','Invoices','Billing, signatures and receipts'],['payments','Payments','Balances and payment records'],['quickpay','Quick Payment','Create an invoice and collect payment'],['expenses','Expenses & receipts','Record costs and receipt photos']]],
 ['Products & stock',[['products','Products & services','Parts, labor and pricing'],['inventory','Inventory','Stock levels and adjustments'],['suppliers','Suppliers & orders','Purchase orders and deliveries']]],
 ['Team & payroll',[['team','Team','Technician contacts and availability'],['payroll','Payroll','Commissions and payout reports'],['reports','Team performance','Work and revenue reports']]],
 ['Gallery & marketing',[['gallery','Photos','Project photos and attachments'],['socialposts','Social media','Draft posts using project photos']]]
];
window.OfficeWorkspace={
 renderOffice(content,actions){
  if(!permitted())return;
  actions.innerHTML=`<button class="btn" onclick="OfficeWorkspace.email()">New email</button><button class="btn btn-primary" onclick="openJobModal()">New job</button>${IS_OWNER?'<button class="btn" onclick="OfficeWorkspace.addUser()">+ Office user</button>':''}`;
  const tasks=STORE.tasks.filter(t=>t.status==='open').length,pending=(STORE.leadOffers||[]).filter(o=>o.status==='pending'&&new Date(o.expiresAt)>new Date()).length;
  content.innerHTML=`<section class="office-welcome"><span class="eyebrow">OFFICE WORKSPACE</span><h2>${isOfficeRole()?'Welcome, '+esc(CURRENT_TEAM_MEMBER.name||'Office'):'Office operations'}</h2><p>Communication, scheduling, billing and daily operations in one place.</p><div class="office-shortcuts"><button onclick="go('followups')">${tasks} open tasks</button><button onclick="go('leads')">${pending} technician offers pending</button></div></section>${groups.map(([title,entries])=>`<section class="office-section"><h3>${title}</h3><div class="office-grid">${entries.map(([key,label,detail])=>`<button data-workspace-link="${key}" onclick="go('${key}')"><span class="office-tool-icon" aria-hidden="true">${esc((typeof NAV!=='undefined'?NAV.find(n=>n.key===key)?.emoji:null)||({communications:'💬',calls:'📞',calendar:'📅',followups:'✅',jobs:'🛠️',customers:'👥',expenses:'🧾',team:'👥',payroll:'💵',reports:'📊'}[key])||'📋')}</span><span class="office-tool-copy"><strong>${label}</strong><span>${detail}</span></span><b aria-hidden="true">↗</b></button>`).join('')}</div></section>`).join('')}`;
 },
 addUser(){if(!IS_OWNER)return;openTeamModal();document.getElementById('f_role').value='Office';},
 email(){
  if(!permitted())return;
  showModal({title:'New office email',body:'<label class="field"><span class="lbl">To</span><input id="office_email_to" type="email" autocomplete="email"></label><label class="field"><span class="lbl">Subject</span><input id="office_email_subject" maxlength="200"></label><label class="field"><span class="lbl">Message</span><textarea id="office_email_body" rows="7"></textarea></label><p class="muted">Sent from the company email address. Replies go to the company mailbox.</p>',onSave:async()=>{
   const to=document.getElementById('office_email_to').value.trim(),subject=document.getElementById('office_email_subject').value.trim(),body=document.getElementById('office_email_body').value.trim();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||!subject||!body)return toast('Enter a valid email, subject and message.',true);
   if(await tryGmailSend(to,subject,body)){closeModal();await refreshCollection('auditLog');}
  }});document.getElementById('modalSaveBtn').textContent='Send email';
 },
 editTechnician(id){
  if(!isOfficeRole())return;const t=getOne('team',id);if(!t||t.role!=='Technician'||t.archivedAt)return toast('Choose an active roster technician.',true);
  showModal({title:'Technician details — '+t.name,body:`${[['name','Name'],['phone','Phone'],['email','Contact email']].map(([key,label])=>`<label class="field"><span class="lbl">${label}</span><input id="office_tech_${key}" value="${esc(t[key])}"></label>`).join('')}<label class="field"><span class="lbl">Availability</span><select id="office_tech_status">${['Active','Inactive','On Leave'].map(s=>`<option ${t.status===s?'selected':''}>${s}</option>`).join('')}</select></label><label class="field"><span class="lbl">Commission %</span><input id="office_tech_commission" type="number" min="0" max="100" step="0.1" value="${Number(t.commissionPercent)||0}"></label>`,onSave:async()=>{
   const data={};for(const k of ['name','phone','email'])data[k]=document.getElementById('office_tech_'+k).value.trim();data.status=document.getElementById('office_tech_status').value.toLowerCase();data.commissionPercent=Number(document.getElementById('office_tech_commission').value);
   if(!data.name||!Number.isFinite(data.commissionPercent)||data.commissionPercent<0||data.commissionPercent>100)return toast('Enter a name and commission between 0 and 100.',true);
   await dbSet('team',id,data);closeModal();toast('Technician details saved');
  }});
 },
 renderSocial(content,actions){
  if(!permitted()){actions.innerHTML='';content.innerHTML=emptyState('🔒','Office access required','');return;}
  actions.innerHTML='<button class="btn btn-primary" onclick="OfficeWorkspace.post()">+ New post</button>';
  const posts=[...(STORE.socialPosts||[])].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  content.innerHTML=`<section class="office-welcome"><span class="eyebrow">SOCIAL MEDIA</span><h2>Posts & project photos</h2><p>Prepare posts for Instagram, Facebook and Google Business Profile. Save the caption, photos and planned date. Automatic publishing is available after the social accounts are connected.</p><div class="office-shortcuts">${platforms.map(([,name])=>`<span>${name} · Account connection pending</span>`).join('')}</div></section><div class="office-posts">${posts.length?posts.map(p=>`<button class="office-post" onclick="OfficeWorkspace.post(${arg(p.id)})">${p.photos?.[0]?.url?`<img src="${esc(safeDoorImageUrl(p.photos[0].url))}" alt="${esc(p.title)}">`:''}<span class="badge badge-draft">${p.status==='posted_manual'?'Published manually':p.status==='ready'?'Ready for review':'Draft'}</span><strong>${esc(p.title)}</strong><p>${esc(p.caption.slice(0,180))}</p><small>${p.platforms.map(k=>platforms.find(x=>x[0]===k)?.[1]||k).map(esc).join(' · ')}${p.scheduledFor?' · Planned '+esc(fmtDate(p.scheduledFor)):''}</small></button>`).join(''):emptyState('📣','No posts yet','Prepare your first post with photos from the gallery.')}</div>`;
 },
 post(id){
  if(!permitted())return;const p=id?getOne('socialPosts',id):null;
  const choices=STORE.galleryProjects.flatMap(g=>(g.photos||[]).filter(ph=>!ph.uploading&&ph.id).map(ph=>({...ph,label:g.title||'Project photo'})));
  const unique=[...new Map([...(p?.photos||[]),...choices].map(ph=>[ph.id,ph])).values()];
  showModal({title:p?'Edit social post':'New social post',wide:true,body:`<label class="field"><span class="lbl">Title</span><input id="social_title" value="${esc(p?.title)}" maxlength="200"></label><label class="field"><span class="lbl">Caption</span><textarea id="social_caption" rows="6">${esc(p?.caption)}</textarea></label><div class="office-shortcuts">${platforms.map(([key,label])=>`<label><input type="checkbox" class="social-platform" value="${key}" ${p?.platforms?.includes(key)?'checked':''}> ${label}</label>`).join('')}</div><div class="field-row"><label class="field"><span class="lbl">Planned date (no automatic publishing)</span><input id="social_date" type="datetime-local" value="${p?.scheduledFor?new Date(new Date(p.scheduledFor)-new Date(p.scheduledFor).getTimezoneOffset()*60000).toISOString().slice(0,16):''}"></label><label class="field"><span class="lbl">Status</span><select id="social_status">${[['draft','Draft'],['ready','Ready for review'],['posted_manual','Published manually']].map(([v,l])=>`<option value="${v}" ${p?.status===v?'selected':''}>${l}</option>`).join('')}</select></label></div><label class="field"><span class="lbl">Published post link (required when published manually)</span><input id="social_url" type="url" value="${esc(p?.publishedUrl)}" placeholder="https://..."></label><h4>Project photos</h4><div class="office-photo-picker">${unique.map(ph=>`<label><input type="checkbox" class="social-photo" value="${esc(ph.id)}" ${p?.photos?.some(x=>x.id===ph.id)?'checked':''}><img src="${esc(safeDoorImageUrl(ph.url))}" alt="${esc(ph.label||'Project photo')}" loading="lazy"></label>`).join('')||'<p>Add project photos in Gallery to attach them here.</p>'}</div><button type="button" class="btn" onclick="OfficeWorkspace.copyCaption()">Copy caption</button>`,onSave:async()=>{
   const title=document.getElementById('social_title').value.trim(),caption=document.getElementById('social_caption').value.trim(),status=document.getElementById('social_status').value,url=document.getElementById('social_url').value.trim(),date=document.getElementById('social_date').value;
   const selectedPlatforms=[...document.querySelectorAll('.social-platform:checked')].map(el=>el.value),photoIds=new Set([...document.querySelectorAll('.social-photo:checked')].map(el=>el.value));
   if(!title||!caption||!selectedPlatforms.length)return toast('Add a title, caption and at least one platform.',true);
   if(status==='posted_manual'&&!/^https:\/\//.test(url))return toast('Add the published post link before marking it published.',true);
   const data={title,caption,status,platforms:selectedPlatforms,photos:unique.filter(ph=>photoIds.has(ph.id)),scheduledFor:date?new Date(date).toISOString():null,publishedUrl:url||null};
   if(p)await dbSet('socialPosts',id,data);else await dbAdd('socialPosts',data);closeModal();render();toast('Social post saved');
  }});
 },
 async copyCaption(){try{await navigator.clipboard.writeText(document.getElementById('social_caption').value);toast('Caption copied');}catch{toast('Select and copy the caption from the text box.',true);}}
};
})();

// Load the manual linked-device inbox separately from the existing Cloud API.
(function(){const script=document.createElement('script');script.src='/whatsapp-linked-device.js';script.onload=()=>{if((route.page==='communications'||route.page==='receptionist')&&!document.querySelector('.overlay'))render();};document.body.append(script);})();
