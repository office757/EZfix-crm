/* Dashboard presentation over the existing CRM collections and routes. */
'use strict';
function workspaceDate(value){return fmtDate(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00':value);}
function workspaceAction(page,id){return `go(${esc(JSON.stringify(page))},${esc(JSON.stringify(id||null))})`;}
function workspaceIcon(key){
 const path=NAV.find(n=>n.key===key)?.icon||'M4 7h16M4 12h16M4 17h16';
 return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}
function workspaceRelativeDate(value){
 const day=String(value||'').slice(0,10);
 return day===todayISO()?'Today':day===dateNDaysAgo(1)?'Yesterday':workspaceDate(value);
}
function workspaceActivityDate(value){
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return 'Date unavailable';
 const day=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
 return `${workspaceRelativeDate(day)} · ${date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`;
}
function workspaceDateTile(value){
 if(!value)return '<span class="overview-date-tile"><small>DATE</small><b>—</b></span>';
 const date=new Date(value+'T12:00:00');
 return `<span class="overview-date-tile ${value===todayISO()?'is-today':''}" aria-label="${esc(workspaceDate(value))}"><small>${esc(date.toLocaleDateString('en-US',{month:'short'}))}</small><b>${date.getDate()}</b></span>`;
}
function workspaceMetric(label,value,sub='',action='',accent=false){
 const tag=action?'button':'div';
 return `<${tag} class="overview-metric ${accent?'overview-accent':''}" ${action?`type="button" onclick="${action}"`:''}><span>${label}</span><strong>${value}</strong>${sub?`<small>${sub}</small>`:''}</${tag}>`;
}
function workspaceStat(label,value,sub='',action='',tone=''){
 const tag=action?'button':'div';
 return `<${tag} class="overview-stat ${tone}" ${action?`type="button" onclick="${action}"`:''}><span class="overview-stat-copy"><span>${label}</span>${sub?`<small>${sub}</small>`:''}</span><strong>${value}</strong>${action?'<span class="overview-row-arrow" aria-hidden="true">›</span>':''}</${tag}>`;
}
function workspaceHero(label,value,sub,action,icon,tone=''){
 return `<button type="button" class="overview-hero ${tone} ${String(value).length>11?'overview-hero-long-number':''}" onclick="${action}"><span class="overview-hero-top"><span class="overview-hero-icon">${workspaceIcon(icon)}</span><span class="overview-row-arrow" aria-hidden="true">↗</span></span><span class="overview-hero-label">${label}</span><strong>${value}</strong><small>${sub}</small></button>`;
}
function workspaceActivityLink(a){
 const aliases={invoice:'invoices',estimate:'estimates',job:'jobs',customer:'customers',lead:'leads',payment:'payments',task:'followups'};
 const page=aliases[a.entityType]||a.entityType;
 return a.entityId&&NAV.some(n=>n.key===page&&(!n.ownerOnly||IS_OWNER))?workspaceAction(page,a.entityId):'';
}
function renderWorkspaceOverview(content,actions,d){
 const today=todayISO(),m=workspaceMetric,stat=workspaceStat;
 const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
 const group=(name,detail,icon,items)=>`<section class="overview-group"><header class="overview-group-heading"><span class="overview-section-icon">${workspaceIcon(icon)}</span><div><h3>${name}</h3><p>${detail}</p></div></header><div class="overview-stats">${items}</div></section>`;
 const link=(label,action)=>`<button type="button" class="overview-link" onclick="${action}">${label}<span aria-hidden="true">↗</span></button>`;
 const view=(page,label='View all')=>link(label,`go('${page}')`);
 const empty=(title,detail,icon,cta,action)=>`<div class="overview-empty"><span class="overview-empty-icon">${workspaceIcon(icon)}</span><b>${title}</b><p>${detail}</p>${cta?link(cta,action):''}</div>`;
 const section=(id,title,detail,icon,action,body)=>`<section class="overview-feed-section" aria-labelledby="${id}"><header><span class="overview-section-icon">${workspaceIcon(icon)}</span><div class="overview-feed-heading"><h3 id="${id}">${title}</h3><p>${detail}</p></div>${action}</header>${body}</section>`;
 const followUps=[...d.followUpsDue].sort((a,b)=>a.nextFollowUp.localeCompare(b.nextFollowUp));
 const flaggedCalls=new Set([...d.missedCallsToday,...d.callsNeedReview].map(c=>c.id||c.providerCallId));
 const reviewCount=d.waAttention.length+flaggedCalls.size;
 actions.innerHTML='<button class="btn" onclick="openGlobalSearch()">Search</button><button class="btn btn-primary" onclick="openLeadModal()">+ New lead</button>';
 content.innerHTML=`<div class="overview-page">
  <section class="overview-panel overview-important" aria-labelledby="importantDataTitle">
   <header class="overview-panel-heading"><div><span class="overview-eyebrow">AT A GLANCE</span><h2 id="importantDataTitle">Important Data</h2><p class="overview-panel-description">The numbers behind your day.</p></div><div class="overview-date">${workspaceIcon('calendar')}<span><b>${esc(workspaceDate(today))}</b><small>Today’s overview</small></span></div></header>
   <div class="overview-hero-grid">
    ${workspaceHero('Invoiced today',money(d.revenueToday),'Invoices dated today',"searchTerms.invoiceFilter='all';go('invoices')",'invoices','overview-hero-featured')}
    ${workspaceHero('Collected today',money(d.paymentsToday),'Recorded payments',"go('payments')",'payments','overview-hero-paid')}
    ${workspaceHero('Outstanding balance',money(d.outstanding),plural(d.unpaidInvoices.length,'unpaid invoice'),"searchTerms.invoiceFilter='outstanding';go('invoices')",'banking',d.outstanding>0?'overview-hero-due':'')}
    ${workspaceHero('Jobs today',d.jobsToday.length,'On today’s calendar',"openCalendarDay(todayISO())",'calendar')}
   </div>
   <div class="overview-detail-grid">
    ${group('Revenue','Invoice totals','invoices',stat('Last 7 days',money(d.revenueWeek))+stat('This month',money(d.revenueMonth))+stat('Average invoice',money(d.avgTicket),'Across all invoices'))}
    ${group('Pipeline','From lead to customer','leads',stat('New leads today',d.newLeadsToday,plural(d.openLeads,'open lead'),"go('leads')")+stat('Open estimates',d.openEstimates.length,'Draft and sent',"searchTerms.estimateFilter='open';go('estimates')")+`<div class="overview-rates"><div><strong>${STORE.leads.length?d.leadConversionRate+'%':'—'}</strong><span>Lead conversion</span></div><div><strong>${STORE.estimates.some(e=>['approved','declined'].includes(e.status))?d.estimateApprovalRate+'%':'—'}</strong><span>Estimate approval</span></div></div>`)}
    ${group('Operations','Keep the day moving','jobs',stat('Next appointment',d.nextAppointment?esc(workspaceRelativeDate(d.nextAppointment.scheduledDate)):'None',d.nextAppointment?esc(d.nextAppointment.customerName||'Scheduled visit'):'No upcoming visit',d.nextAppointment?workspaceAction('jobs',d.nextAppointment.id):"go('calendar')",'overview-stat-appointment')+stat('Follow-ups due',followUps.length,'Today and overdue',"document.getElementById('overviewFollowUps').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});document.getElementById('overviewFollowUps').focus({preventScroll:true})",followUps.length?'overview-stat-attention':'')+stat('Unscheduled jobs',d.unscheduledJobs.length,'Choose an appointment',"go('jobs')",d.unscheduledJobs.length?'overview-stat-attention':''))}
   </div>
   <details class="overview-connections" ${window.workspacePhoneExpanded?'open':''} ontoggle="window.workspacePhoneExpanded=this.open">
    <summary><span class="overview-section-icon">${workspaceIcon('receptionist')}</span><span class="overview-connection-title"><b>Phone & Integration Health</b><small>Calls, WhatsApp and payment links</small></span><span class="overview-connection-chips"><span>${plural(d.callsToday.length,'call')} today</span><span class="${reviewCount?'overview-chip-attention':''}">${reviewCount?reviewCount+' to review':'No flagged alerts'}</span></span><span class="overview-disclosure"><span class="overview-show-label">Show details</span><span class="overview-hide-label">Hide details</span><i aria-hidden="true">⌄</i></span></summary>
    <div class="overview-connections-body"><div class="overview-metrics overview-phone-metrics">
     ${m('Calls today',d.callsToday.length,'',"go('receptionist')")}${m('Linked leads',d.linkedLeadIdsToday.size,'From today’s calls',"go('leads')")}${m('Appointment requests',d.appointmentRequestsToday.length,'From today’s calls',"go('receptionist')")}${m('Missed calls',d.missedCallsToday.length,'Today',"go('receptionist')",d.missedCallsToday.length>0)}
     ${m('WhatsApp review',d.waAttention.length,d.waAttention.length?'Setup or delivery needs review':'No flagged alerts',"go('walog')",d.waAttention.length>0)}${m('Calls to review',d.callsNeedReview.length,'Confirm intake details',"go('receptionist')",d.callsNeedReview.length>0)}${m('Square pending',d.squareAwaitingPayment.length,'Unpaid payment links',"searchTerms.invoiceFilter='outstanding';go('invoices')")}
    </div><div class="overview-connections-footer">${view('receptionist','Open phone workspace')}</div></div>
   </details>
  </section>
  <section class="overview-panel overview-work" aria-labelledby="workOverviewTitle">
   <header class="overview-panel-heading"><div><span class="overview-eyebrow">YOUR DAY, ORGANIZED</span><h2 id="workOverviewTitle">Work Overview</h2><p class="overview-panel-description">Pick up where your team left off.</p></div><div class="overview-quick-actions"><button class="btn btn-sm" onclick="openEstimateModal()">+ Estimate</button><button class="btn btn-sm" onclick="openInvoiceModal()">+ Invoice</button><button class="btn btn-sm overview-create-job" onclick="openJobModal()">+ New job</button></div></header>
   <div class="overview-feed-grid">
    ${section('overviewJobsTitle','Upcoming jobs','Next scheduled visits','calendar',view('calendar','Calendar'),d.nextJobs.length?'<div class="overview-list">'+d.nextJobs.map(j=>`<button type="button" class="overview-list-row" onclick="${workspaceAction('jobs',j.id)}">${workspaceDateTile(j.scheduledDate)}<span class="overview-row-copy"><b>${esc(j.title||'Garage door service')}</b><small>${esc(j.customerName||'Customer')}${j.appointmentWindow?' · '+esc(j.appointmentWindow):''}</small></span><span class="overview-status ${['scheduled','technician_assigned','accepted'].includes(j.status)?'overview-status-scheduled':j.status==='work_in_progress'?'overview-status-progress':''}">${esc(labelize(String(j.status||'').replace(/_/g,' ')))}</span><span class="overview-row-arrow" aria-hidden="true">›</span></button>`).join('')+'</div>':empty('Your calendar is clear','Schedule a job to plan the next visit.','calendar','Schedule a job','openJobModal()'))}
    <div id="overviewFollowUps" class="overview-followups-wrap" tabindex="-1">${section('overviewFollowUpsTitle','Follow-ups',followUps.length?plural(followUps.length,'customer')+' ready for contact':'All customer follow-ups are up to date','leads',view('leads','View leads'),followUps.length?'<div class="overview-list">'+followUps.slice(0,5).map(l=>`<button type="button" class="overview-list-row" onclick="${workspaceAction('leads',l.id)}"><span class="overview-contact-avatar" aria-hidden="true">${esc((l.name||'?').trim().slice(0,1).toUpperCase())}</span><span class="overview-row-copy"><b>${esc(l.name||'Customer')}</b><small>${esc(l.phone||l.email||'Open lead details')}</small></span><span class="overview-followup-date"><span class="overview-due ${l.nextFollowUp<today?'is-overdue':''}">${l.nextFollowUp<today?'Overdue':'Today'}</span><small>${esc(workspaceDate(l.nextFollowUp))}</small></span><span class="overview-row-arrow" aria-hidden="true">›</span></button>`).join('')+'</div>':empty('You’re all caught up','Your next customer follow-up will appear here.','leads','Open leads',"go('leads')"))}</div>
    ${section('overviewPaymentsTitle','Recent payments','Latest recorded payments','payments',view('payments','Payments'),d.recentPayments.length?'<div class="overview-list">'+d.recentPayments.map(p=>`<button type="button" class="overview-list-row" onclick="${workspaceAction('invoices',p.invoiceId)}"><span class="overview-payment-icon">${workspaceIcon('payments')}</span><span class="overview-row-copy"><b>${esc(p.customerName||p.invoiceNumber||'Payment')}</b><small>${esc(p.invoiceNumber||'Invoice')} · ${esc(workspaceRelativeDate(p.date))}</small></span><span class="overview-payment"><b>${money(paymentAppliedAmount(p))}</b><small>${esc(p.method||'Payment')}</small></span><span class="overview-row-arrow" aria-hidden="true">›</span></button>`).join('')+'</div>':empty('No payments recorded yet','Recorded payments will appear here.','payments','Open payments',"go('payments')"))}
    ${section('overviewActivityTitle','Recent activity','Latest team updates','auditlog',IS_OWNER?view('auditlog','History'):'',d.recentEvents.length?'<div class="overview-activity">'+d.recentEvents.map(a=>{const action=workspaceActivityLink(a),tag=action?'button':'div',summary=a.summary||labelize(a.action);return `<${tag} class="overview-activity-row" ${action?`type="button" onclick="${action}"`:''}><span class="overview-activity-dot" aria-hidden="true"></span><span class="overview-activity-copy"><b title="${esc(summary)}">${esc(summary)}</b><small>${esc(workspaceActivityDate(a.createdAt))}</small></span>${action?'<span class="overview-row-arrow" aria-hidden="true">›</span>':''}</${tag}>`;}).join('')+'</div>':empty('A fresh start','Your team’s updates will appear as work gets done.','auditlog','',''))}
   </div>
  </section>
  <div class="overview-tools"><h3>Workspace tools</h3>${renderModuleLauncherHtml()}</div>
 </div>`;
}
function workspaceAttention(){
 const today=todayISO(),items=[];
 const add=(title,detail,rows,page)=>{if(rows.length)items.push({title,detail,count:rows.length,page});};
 add('Overdue invoices','Review outstanding balances.',STORE.invoices.filter(i=>balanceDue(i)>0&&i.dueTerm==='On Receipt'&&i.date&&i.date<today),'invoices');
 add('Jobs awaiting a technician','Review the job and offer it to a technician.',STORE.jobs.filter(j=>!j.technicianId&&!j.technician&&!['completed','cancelled'].includes(j.status)),'jobs');
 add('Estimates awaiting approval','Follow up with the customer.',STORE.estimates.filter(e=>e.status==='sent'),'estimates');
 add('Completed jobs without an invoice','Review the job and prepare its invoice.',STORE.jobs.filter(j=>j.status==='completed'&&!STORE.invoices.some(i=>i.jobId===j.id)),'jobs');
 add('Customer callback requests','A customer requested a person from the office.',STORE.tasks.filter(t=>t.status==='open'&&t.source==='ai_receptionist'&&String(t.id||'').startsWith('ai_human_callback_')),'followups');
 add('WhatsApp needs review','Check delivery, setup or technician opt-in.',(STORE.waNotifications||[]).filter(n=>['failed','not_configured','blocked_no_opt_in'].includes(String(n.status||'').toLowerCase())),'walog');
 add('Call intake needs review','Confirm customer details from the call.',STORE.calls.filter(c=>c.providerCallId&&['ambiguous_identity','needs_review'].includes(String(c.leadExtractionStatus||'').toLowerCase())),'receptionist');
 return items;
}
function renderWorkspaceAttention(content,actions){
 actions.innerHTML='';const items=workspaceAttention();
 content.innerHTML=`<section class="overview-panel"><header class="overview-panel-heading"><div><span class="overview-eyebrow">OFFICE REVIEW</span><h2>Needs Attention</h2></div><span class="overview-total">${items.reduce((s,x)=>s+x.count,0)} items</span></header><div class="overview-attention-list">${items.length?items.map(x=>`<button onclick="go('${x.page}')"><span class="overview-attention-number">${x.count}</span><span><b>${x.title}</b><small>${x.detail}</small></span><span>↗</span></button>`).join(''):'<div class="overview-empty"><b>You’re all caught up</b><p>No items need office review.</p></div>'}</div></section>`;
}
function renderWorkspaceHub(content,actions,page){
 actions.innerHTML='';
 const banking=page==='banking',keys=banking?['payments','invoices','expenses','payroll']:['team','followups','products','inventory','suppliers','reports','viscatalog','settings'];
 const detail={payments:'Review payments received',invoices:'Balances, billing and receipts',expenses:'Track business expenses',payroll:'Technician commissions and payouts',team:'People and account access',followups:'Tasks and customer follow-ups',products:'Your service and parts catalog',inventory:'Stock and inventory levels',suppliers:'Vendors and purchase orders',reports:'Team performance',viscatalog:'Manage door reference images',settings:'Company and integration settings'};
 const entries=keys.map(k=>NAV.find(n=>n.key===k)).filter(n=>n&&(!n.ownerOnly||IS_OWNER));
 content.innerHTML=`<section class="overview-panel"><header class="overview-panel-heading"><div><span class="overview-eyebrow">${banking?'MONEY & RECORDS':'TEAM & OPERATIONS'}</span><h2>${banking?'Banking':'Office'}</h2></div></header><div class="overview-hub-grid">${entries.map(n=>`<button onclick="go('${n.key}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="${n.icon}"/></svg><b>${n.label}</b><span>${detail[n.key]}</span><i>↗</i></button>`).join('')}</div></section>`;
}
