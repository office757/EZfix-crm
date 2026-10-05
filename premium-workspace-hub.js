/* Premium workspace presentation; existing authorization and actions remain authoritative. */
let workspaceMonthCursor='';
function workspaceLocalDay(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function selectWorkspaceCalendarDay(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;workspaceScheduleDate=day;workspaceMonthCursor=day.slice(0,7);render();}
function shiftWorkspaceCalendarMonth(offset){const selected=workspaceMonthCursor||(workspaceScheduleDate||todayISO()).slice(0,7),[year,month]=selected.split('-').map(Number);workspaceMonthCursor=workspaceLocalDay(new Date(year,month-1+offset,1)).slice(0,7);render();}
function renderWorkspaceMonth(){
 const selected=workspaceScheduleDate||todayISO(),[year,month]=(workspaceMonthCursor||selected.slice(0,7)).split('-').map(Number),first=new Date(year,month-1,1),weeks=Math.ceil((first.getDay()+new Date(year,month,0).getDate())/7),start=new Date(year,month-1,1-first.getDay());
 const jobsByDay=new Map();for(const j of STORE.jobs||[]){if(j.deletedAt||j.status==='cancelled'||!j.scheduledDate)continue;const list=jobsByDay.get(j.scheduledDate)||[];list.push(j);jobsByDay.set(j.scheduledDate,list);}
 const jobs=jobsByDay.get(selected)||[],techs=new Set(jobs.map(j=>j.technicianId||j.technician).filter(Boolean)),pending=jobs.filter(j=>!j.technicianId&&!j.technician).length;
 return `<div class="overview-month"><div class="overview-month-stats"><span><b>${jobs.length}</b> Selected day jobs</span><span><b>${techs.size}</b> Technicians</span><span><b>${pending}</b> Unassigned</span></div><div class="overview-month-heading"><button type="button" aria-label="Previous month" onclick="shiftWorkspaceCalendarMonth(-1)">‹</button><b>${esc(first.toLocaleDateString('en-US',{month:'long',year:'numeric'}))}</b><button type="button" aria-label="Next month" onclick="shiftWorkspaceCalendarMonth(1)">›</button></div><div class="overview-month-grid" role="group" aria-label="Choose a day">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span class="overview-month-weekday">${d}</span>`).join('')}${Array.from({length:weeks*7},(_,i)=>{const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i),key=workspaceLocalDay(d),rows=jobsByDay.get(key)||[];return `<button type="button" class="overview-month-day ${d.getMonth()!==first.getMonth()?'outside':''} ${key===selected?'selected':''} ${key===todayISO()?'today':''}" aria-pressed="${key===selected}" aria-label="${esc(workspaceDate(key))}, ${rows.length} jobs" onclick="selectWorkspaceCalendarDay('${key}')"><b>${d.getDate()}</b><span class="overview-month-dots" aria-hidden="true">${rows.slice(0,3).map(j=>`<i style="background:${jobStatusAccent(j.status)}"></i>`).join('')}${rows.length>3?'<small>+</small>':''}</span></button>`;}).join('')}</div></div>`;
}
function openCampaignAds(){receptionistState.subview='manager';aiManagerState.subview='google_ads';render();}
function renderAshleyCampaignHub(body){
 body.innerHTML=`<section class="campaign-hub"><header class="premium-hub-heading"><span>CAMPAIGN MANAGER</span><h2>Turn your work into your next customer.</h2><p>Plan campaigns, create complete posts and organize your social media in one workspace.</p></header><div class="campaign-hub-actions"><button class="campaign-hub-card" onclick="CampaignWorkspace.open()"><span>${workspaceIcon('calendar')}</span><h3>Campaign planner</h3><p>Saved campaigns, publishing dates and review approvals.</p><b>Open campaigns ↗</b></button><button class="campaign-hub-card" onclick="go('socialposts')"><span>${workspaceIcon('socialposts')}</span><h3>Social media &amp; AI posts</h3><p>Facebook, Instagram and Google Business Profile. Create captions and matching images.</p><b>Open social workspace ↗</b></button><button class="campaign-hub-card" onclick="openCampaignAds()"><span>${workspaceIcon('reports')}</span><h3>Advertising &amp; connections</h3><p>Google Ads account authorization, connection checks and reporting.</p><b>Manage connections ↗</b></button></div><div id="campaignSocialConnections" class="campaign-social-connections" role="status" aria-live="polite">Checking social account connections…</div></section>`;
 loadCampaignSocialConnections(body);
}
async function loadCampaignSocialConnections(body){
 const el=body.querySelector('#campaignSocialConnections');if(!el)return;
 try{const {data,error}=await SB.functions.invoke('marketing-connector-readiness',{body:{}});if(error||!data?.ok)throw Error();if(!el.isConnected)return;const c=data.connectors||{};el.innerHTML=`<h3>Social account connections</h3><div>${[['Facebook',c.meta?.facebook_connected],['Instagram',c.meta?.instagram_connected],['Google Business Profile',c.google_business_profile?.connected]].map(([name,connected])=>`<span><b>${name}</b><small>${connected?'Connected':'Not connected — setup required'}</small></span>`).join('')}</div><p>Post drafts and campaigns are available now. Automatic publishing is not enabled. Complete the provider setup and account authorization first.</p>`;}catch{if(el.isConnected)el.textContent='Connection status unavailable. Your saved campaigns and post drafts are still available.';}
}
/* Realtime collection updates: only new positive payment records after a loaded baseline. */
(() => {
 let identity=null,seen=new Set(),ready=false;
 const base=refreshCollection;
 refreshCollection=async function(col,...args){const result=await base(col,...args);if(col!=='invoices')return result;
  const member=IS_OWNER&&!isTechnicianView()?CURRENT_TEAM_MEMBER?.id:null;
  if(member!==identity){identity=member;seen=new Set();ready=false;}
  if(!member)return result;
  const added=[];for(const inv of STORE.invoices||[])if(!inv.deletedAt)for(const p of inv.payments||[]){const id=p.squarePaymentId||p.externalPaymentId||p.id;if(!id||!Number.isFinite(Number(p.appliedAmount??p.amount))||Number(p.appliedAmount??p.amount)<=0||['refund','adjustment'].includes(String(p.type||'').toLowerCase())||!['','completed','paid','succeeded','payment'].includes(String(p.status||'').toLowerCase()))continue;const key=inv.id+':'+id;if(!seen.has(key)){seen.add(key);if(ready)added.push(p);}}
  if(ready&&added.length)toast(`${added.length===1?'Payment recorded':'Payments recorded'} · ${money(added.reduce((sum,p)=>sum+Number(p.appliedAmount??p.amount),0))}`);
  ready=true;return result;
 };
})();
