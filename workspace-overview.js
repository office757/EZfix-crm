/* Dashboard presentation over the existing CRM collections and routes. */
'use strict';
function workspaceDate(value){return fmtDate(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00':value);}
function workspaceAction(page,id){return `go(${esc(JSON.stringify(page))},${esc(JSON.stringify(id||null))})`;}
function workspaceMetric(label,value,sub='',action='',accent=false){
 const tag=action?'button':'div';
 return `<${tag} class="overview-metric ${accent?'overview-accent':''}" ${action?`type="button" onclick="${action}"`:''}><span>${label}</span><strong>${value}</strong><small>${sub||'&nbsp;'}</small></${tag}>`;
}
function renderWorkspaceOverview(content,actions,d){
 const m=workspaceMetric;
 const group=(name,items)=>`<div class="overview-group"><h3>${name}</h3><div class="overview-metrics">${items}</div></div>`;
 const empty=(title,detail)=>`<div class="overview-empty"><span>—</span><b>${title}</b><p>${detail}</p></div>`;
 const section=(title,link,body)=>`<section class="overview-feed-section"><header><h3>${title}</h3>${link}</header>${body}</section>`;
 const view=(page,label='View all')=>`<button class="overview-link" onclick="go('${page}')">${label} <span>↗</span></button>`;
 actions.innerHTML='<button class="btn" onclick="openGlobalSearch()">Search</button><button class="btn btn-primary" onclick="openLeadModal()">+ New lead</button>';
 content.innerHTML=`<div class="overview-page">
  <section class="overview-panel" aria-labelledby="importantDataTitle">
   <header class="overview-panel-heading"><div><span class="overview-eyebrow">BUSINESS OVERVIEW</span><h2 id="importantDataTitle">Important Data</h2></div><div class="overview-date">${esc(workspaceDate(todayISO()))}<span>Current CRM data</span></div></header>
   ${group('Revenue',m('Today',money(d.revenueToday),money(d.paymentsToday)+' collected',"go('invoices')",true)+m('This week',money(d.revenueWeek),'Last 7 days')+m('This month',money(d.revenueMonth),'Invoiced revenue')+m('Average ticket',money(d.avgTicket),'All invoices'))}
   ${group('Pipeline',m('New leads today',d.newLeadsToday,d.openLeads+' open leads',"go('leads')")+m('Lead conversion',d.leadConversionRate+'%','Won or converted')+m('Open estimates',d.openEstimates.length,'Draft and sent',"searchTerms.estimateFilter='open';go('estimates')")+m('Estimate approval',d.estimateApprovalRate+'%','Of decided estimates'))}
   ${group('Operations',m('Jobs today',d.jobsToday.length,d.unscheduledJobs.length+' unscheduled',"openCalendarDay(todayISO())")+m('Next appointment',d.nextAppointment?esc(workspaceDate(d.nextAppointment.scheduledDate)):'—',d.nextAppointment?esc(d.nextAppointment.customerName||''):'None scheduled',"go('calendar')")+m('Outstanding',money(d.outstanding),d.unpaidInvoices.length+' unpaid invoices',"searchTerms.invoiceFilter='outstanding';go('invoices')",true)+m('Follow-ups due',d.followUpsDue.length,'Ready for contact',"go('leads')"))}
   <div class="overview-group overview-connections"><div class="overview-group-heading"><h3>Phone & Integration Health</h3>${view('receptionist','Open phone')}</div><div class="overview-metrics overview-phone-metrics">
    ${m('Calls today',d.callsToday.length)}${m('Linked leads',d.linkedLeadIdsToday.size)}${m('Appointment requests',d.appointmentRequestsToday.length)}${m('Missed calls',d.missedCallsToday.length)}
    ${m('WhatsApp',d.waAttention.length,d.waAttention.length?'Needs setup / review':'No flagged alerts',"go('walog')")}${m('Calls to review',d.callsNeedReview.length,'Intake review',"go('receptionist')")}${m('Square pending',d.squareAwaitingPayment.length,'Awaiting payment',"searchTerms.invoiceFilter='outstanding';go('invoices')")}
   </div></div>
  </section>
  <section class="overview-panel overview-work" aria-labelledby="workOverviewTitle">
   <header class="overview-panel-heading"><div><span class="overview-eyebrow">YOUR WORKSPACE</span><h2 id="workOverviewTitle">Work Overview</h2></div><div class="overview-quick-actions"><button class="btn btn-sm" onclick="openJobModal()">+ Job</button><button class="btn btn-sm" onclick="openEstimateModal()">+ Estimate</button><button class="btn btn-sm" onclick="openInvoiceModal()">+ Invoice</button></div></header>
   <div class="overview-feed-grid">
    ${section('Upcoming jobs',view('jobs'),d.nextJobs.length?'<div class="overview-list">'+d.nextJobs.map(j=>`<button class="overview-list-row" onclick="${workspaceAction('jobs',j.id)}"><span class="overview-date-tile">${j.scheduledDate?esc(workspaceDate(j.scheduledDate)):'To schedule'}</span><span class="overview-row-copy"><b>${esc(j.title)}</b><small>${esc(j.customerName||'Customer')}</small></span><span class="overview-status">${esc(labelize(j.status))}</span></button>`).join('')+'</div>':empty('No upcoming jobs','Your scheduled work will appear here.'))}
    ${section('Recent payments',view('invoices'),d.recentPayments.length?'<div class="overview-list">'+d.recentPayments.map(p=>`<div class="overview-list-row"><span class="overview-row-copy"><b>${esc(p.invoiceNumber)}</b><small>${esc(p.customerName||'')} · ${esc(workspaceDate(p.date))}</small></span><span class="overview-payment"><b>${money(paymentAppliedAmount(p))}</b><small>${esc(p.method||'Payment')}</small></span></div>`).join('')+'</div>':empty('No recent payments','Recorded invoice payments appear here.'))}
    ${section('Follow-ups',view('leads','View leads'),d.followUpsDue.length?'<div class="overview-list">'+d.followUpsDue.slice(0,5).map(l=>`<button class="overview-list-row" onclick="${workspaceAction('leads',l.id)}"><span class="overview-row-copy"><b>${esc(l.name)}</b><small>${esc(l.phone||'')}</small></span><span class="overview-due">${esc(workspaceDate(l.nextFollowUp))}</span></button>`).join('')+'</div>':empty('You’re caught up','No lead follow-ups are due.'))}
    ${section('Recent activity',IS_OWNER?view('auditlog','View history'):'',d.recentEvents.length?'<div class="overview-activity">'+d.recentEvents.map(a=>`<div><span class="overview-activity-dot"></span><span><b>${esc(a.summary||labelize(a.action))}</b><small>${esc(workspaceDate(a.createdAt))}</small></span>${a.entityType&&a.entityId?`<button aria-label="Open activity record" class="overview-link" onclick="${workspaceAction(a.entityType,a.entityId)}">↗</button>`:''}</div>`).join('')+'</div>':empty('No activity yet','Your team’s recent updates will appear here.'))}
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
