/* Personal, read-only earnings from the same saved figures used by office payroll. */
let earningsRange = {from:'',to:''};
function earningsDateRange(preset) {
  const end=new Date(),start=new Date(end);
  if(preset==='week')start.setDate(start.getDate()-start.getDay());
  else if(preset==='lastmonth'){start.setMonth(start.getMonth()-1,1);end.setDate(0);}
  else start.setDate(1);
  return {from:payrollDateKey(start),to:payrollDateKey(end)};
}
function setEarningsPreset(preset) {
  earningsRange=earningsDateRange(preset);
  render();
}
function setEarningsDate(field,value) {
  if(!['from','to'].includes(field))return;
  earningsRange[field]=value;
  render();
}
function personalEarningsData() {
  const id=technicianWorkspaceId();
  const member=id && STORE.team.find(m=>m.id===id && String(m.role).toLowerCase()==='technician' && String(m.status).toLowerCase()==='active');
  if(!member)return null;
  const card=payrollTechCardData({key:`id:${id}`,memberId:id,name:member.name,commissionPercent:member.commissionPercent,unlinked:false},{range:earningsRange,strictIdentity:true,allowOverride:false});
  card.rateConfigured=member.commissionPercent!==null && member.commissionPercent!==undefined && member.commissionPercent!=='' && Number.isFinite(Number(member.commissionPercent)) && Number(member.commissionPercent)>=0 && Number(member.commissionPercent)<=100;
  card.rows.sort((a,b)=>(b.job.scheduledDate||'').localeCompare(a.job.scheduledDate||'')||String(a.job.id).localeCompare(String(b.job.id)));
  card.rows.forEach(row=>{
    const invoices=STORE.invoices.filter(i=>!i.deletedAt && i.jobId===row.job.id);
    row.invoiceCount=invoices.length;
    row.collected=invoices.reduce((sum,i)=>sum+paidTotal(i),0);
    row.balance=invoices.reduce((sum,i)=>sum+balanceDue(i),0);
  });
  card.unscheduled=STORE.jobs.filter(j=>!j.deletedAt && j.technicianId===id && !j.scheduledDate).length;
  return card;
}
function renderTechnicianEarnings(content,actions) {
  actions.innerHTML='';
  if(!earningsRange.from && !earningsRange.to)earningsRange=earningsDateRange('month');
  const card=personalEarningsData();
  if(!card){content.innerHTML=emptyState('🔒','Technician access required','Sign in with your active technician account to view your earnings.');return;}
  const {from,to}=earningsRange;
  const validRange=/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&from<=to;
  const amount=value=>card.rateConfigured?money(value):'Not set';
  content.innerHTML=`<div class="earnings-page">
    <section class="panel"><div class="panel-head"><div><h3>${esc(card.name)} · My Earnings</h3><span class="muted">Your assigned jobs only</span></div></div>
      <div class="panel-body pad">
        <div class="toolbar"><button class="btn btn-sm" onclick="setEarningsPreset('week')">This week</button><button class="btn btn-sm" onclick="setEarningsPreset('month')">This month</button><button class="btn btn-sm" onclick="setEarningsPreset('lastmonth')">Last month</button></div>
        <div class="field-row"><label class="field"><span class="lbl">From</span><input type="date" value="${esc(from)}" onchange="setEarningsDate('from',this.value)"></label><label class="field"><span class="lbl">To</span><input type="date" value="${esc(to)}" onchange="setEarningsDate('to',this.value)"></label></div>
        <p class="muted">Based on each job’s scheduled date and the saved commission rate. These are calculated earnings; this report does not record payroll payments.</p>
        ${!card.rateConfigured?'<p role="status">Your commission rate has not been configured. Ask the office to set it before relying on a payout total.</p>':''}
        ${card.unscheduled?`<p class="muted">${card.unscheduled} unscheduled job(s) are outside this date report.</p>`:''}
      </div>
    </section>
    ${!validRange?'<div class="panel"><div class="panel-body pad" role="status">Choose a start and end date, with the end on or after the start.</div></div>':`
      <div class="stat-grid" style="margin:16px 0">
        <div class="stat-card"><div class="label">Jobs in period</div><div class="value">${card.jobs.length}</div></div>
        <div class="stat-card"><div class="label">Commission</div><div class="value">${amount(card.commission)}</div></div>
        <div class="stat-card"><div class="label">Parts reimbursement</div><div class="value">${money(card.totalReimbursement)}</div></div>
        <div class="stat-card accent"><div class="label">Calculated payout</div><div class="value">${amount(card.payout)}</div></div>
      </div>
      <div class="panel" style="margin-bottom:16px"><div class="panel-body pad">Commission = (invoiced revenue before tax − parts cost) × ${card.rateConfigured?`${card.commissionPct}%`:'your saved rate'}. Technician-paid parts are added back once. Sales tax and card fees do not earn commission.</div></div>
      ${card.rows.length?card.rows.map(row=>`<section class="panel" style="margin-bottom:14px">
        <div class="panel-head"><div style="min-width:0;overflow-wrap:anywhere"><h3>${esc(row.job.customerName||row.job.title||'Job')}</h3><span class="muted">${esc(row.job.jobNumber||'')} · ${fmtDate(row.job.scheduledDate)} · ${esc(labelize(row.job.status||'new'))}</span></div><button class="btn btn-sm" data-job="${esc(row.job.id)}" onclick="go('jobs',this.dataset.job)">View job</button></div>
        <div class="panel-body pad">
          ${row.itemLine?`<p style="overflow-wrap:anywhere">${esc(row.itemLine)}</p>`:''}
          <div class="totals-mini">
            <div class="row"><div class="l">Invoiced revenue (pre-tax)</div><div>${money(row.revenue)}</div></div>
            <div class="row"><div class="l">Parts cost · ${row.partsPaidBy==='technician'?'paid by you':'paid by company'}</div><div>−${money(row.materialCost)}</div></div>
            <div class="row"><div class="l">Profit used for commission</div><div>${money(row.jobProfit)}</div></div>
            <div class="row"><div class="l">Commission${card.rateConfigured?` · ${card.commissionPct}%`:''}</div><div>${amount(row.commission)}</div></div>
            <div class="row"><div class="l">Your parts reimbursement</div><div>${money(row.reimbursement)}</div></div>
            <div class="row"><div class="l"><b>Calculated payout</b></div><div><b>${amount(row.jobCut)}</b></div></div>
          </div>
          <p class="muted" style="overflow-wrap:anywhere">${row.invoiceCount?`${esc(row.invNumber||`${row.invoiceCount} invoice(s)`)} · Customer paid ${money(row.collected)} · Balance ${money(row.balance)}`:'No linked invoice yet — the calculation is incomplete.'}</p>
          ${row.job.status!=='completed'?'<p class="muted">This job is not completed. Amounts can change while the job is open.</p>':''}
        </div>
      </section>`).join(''):emptyState('💵','No jobs in this period','Choose another date range to view your assigned jobs.')}
    `}
  </div>`;
}
