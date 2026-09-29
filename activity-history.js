/* Owner activity history. Display recorded evidence without inventing missing details. */
const activityHistoryState={query:'',entity:'all',source:'all',from:'',to:'',limit:100};
const ACTIVITY_ENTITIES={customer:'customers',job:'jobs',invoice:'invoices',estimate:'estimates',lead:'leads',task:'tasks',purchase_orders:'purchaseOrders',inventory_adjustments:'inventoryAdjustments',lead_offers:'leadOffers',job_evidence:'jobEvidence',lead_partners:'leadPartners',social_posts:'socialPosts'};
function activityEntity(event){return ACTIVITY_ENTITIES[event.entityType]||event.entityType||'unknown';}
function activityActor(event){
  if(event.details?.actor_name)return event.details.actor_name;
  if(['invoice_signed_remote','estimate_signed_remote'].includes(event.action))return 'Customer · remote signature';
  if(event.source==='provider')return 'Provider update';
  if(event.createdByTeamId)return STORE.team.find(m=>m.id===event.createdByTeamId)?.name||`Team member ${event.createdByTeamId}`;
  return ['system','database'].includes(event.source)?'System / service · actor not recorded':'Actor not recorded';
}
function activityTime(value){
  const timestamp=recordTimestamp(value);
  return timestamp?new Date(timestamp).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}):'Time not recorded';
}
function activityDate(value){const t=recordTimestamp(value);return t?payrollDateKey(new Date(t)):'';}
function activityChanges(event){
  const before=event.details?.before||{},after=event.details?.after||{};
  return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>!(before[key]==null&&after[key]==null)&&JSON.stringify(before[key])!==JSON.stringify(after[key])).map(key=>({key,before:before[key],after:after[key]}));
}
function activityValue(key,value){
  if(value===undefined||value===null||value==='')return '—';
  if(['material_cost','amount','discount','deposit_required','rate','cost'].includes(key)&&typeof value==='number')return money(value);
  if(['commission_percent','tax_rate','cc_surcharge_percent'].includes(key)&&typeof value==='number')return `${value}%`;
  if(typeof value==='object')return JSON.stringify(value,null,2);
  return String(value);
}
function filteredActivityEvents(){
  const state=activityHistoryState,query=state.query.trim().toLowerCase();
  return [...STORE.auditLog].filter(event=>{
    if(state.entity!=='all'&&activityEntity(event)!==state.entity)return false;
    if(state.source==='database'&&event.source!=='database')return false;
    if(state.source==='other'&&event.source==='database')return false;
    const date=activityDate(event.createdAt);
    if(state.from&&(!date||date<state.from)||state.to&&(!date||date>state.to))return false;
    return !query||[event.action,event.summary,event.entityId,event.relatedId,event.createdByTeamId,activityActor(event),event.details?.reason,...(event.details?.changed_fields||[])].filter(Boolean).join(' ').toLowerCase().includes(query);
  }).sort((a,b)=>recordTimestamp(b.createdAt)-recordTimestamp(a.createdAt));
}
function activityRecordButton(event){
  const entity=activityEntity(event),pages={customers:'customers',jobs:'jobs',invoices:'invoices',estimates:'estimates',team:'team',leads:'leads'},page=pages[entity];
  if(!page||!event.entityId||!STORE[entity]?.some(row=>row.id===event.entityId&&!row.deletedAt))return '';
  return `<button class="btn btn-sm" data-page="${page}" data-record="${esc(event.entityId)}" onclick="go(this.dataset.page,this.dataset.record)">Open ${esc(labelize(entity))}</button>`;
}
function renderDetailedActivity(content,actions){
  actions.innerHTML='';
  if(!IS_OWNER||isTechnicianView()){content.innerHTML=emptyState('🔒','Owner access only','');return;}
  actions.innerHTML='<button class="btn btn-sm" onclick="ActivityHistory.refresh()">Refresh history</button>';
  const state=activityHistoryState,events=filteredActivityEvents(),shown=events.slice(0,state.limit);
  const entities=[...new Set(STORE.auditLog.map(activityEntity))].sort();
  content.innerHTML=`<div class="activity-page">
    <section class="panel"><div class="panel-body pad">
      <div class="activity-filters">
        <label class="field"><span class="lbl">Search actions, people or records</span><input type="search" value="${esc(state.query)}" placeholder="Name, action, record ID or reason" onchange="ActivityHistory.filter('query',this.value)"></label>
        <label class="field"><span class="lbl">Record type</span><select onchange="ActivityHistory.filter('entity',this.value)"><option value="all">All records</option>${entities.map(entity=>`<option value="${esc(entity)}" ${entity===state.entity?'selected':''}>${esc(labelize(entity))}</option>`).join('')}</select></label>
        <label class="field"><span class="lbl">Events</span><select onchange="ActivityHistory.filter('source',this.value)"><option value="all" ${state.source==='all'?'selected':''}>All events</option><option value="database" ${state.source==='database'?'selected':''}>Saved record changes</option><option value="other" ${state.source==='other'?'selected':''}>Workflow & communications</option></select></label>
        <label class="field"><span class="lbl">From</span><input type="date" value="${esc(state.from)}" onchange="ActivityHistory.filter('from',this.value)"></label>
        <label class="field"><span class="lbl">To</span><input type="date" value="${esc(state.to)}" onchange="ActivityHistory.filter('to',this.value)"></label>
      </div>
      <div class="toolbar"><span class="muted">${events.length} matching event(s) · showing ${shown.length}</span><button class="btn btn-sm" onclick="ActivityHistory.reset()">Clear filters</button></div>
      <p class="muted">Open an event to see its recorded details. Older events may only contain a summary; missing actor, reason or field values are shown as unavailable.</p>
    </div></section>
    ${shown.length?shown.map(event=>{
      const changes=activityChanges(event),reason=event.details?.reason,fields=event.details?.changed_fields||[];
      const initiatedBy=event.createdByTeamId&&(['provider'].includes(event.source)||['invoice_signed_remote','estimate_signed_remote'].includes(event.action))?(STORE.team.find(m=>m.id===event.createdByTeamId)?.name||event.createdByTeamId):null;
      return `<details class="panel activity-event"><summary><div class="activity-event-heading"><time>${esc(activityTime(event.createdAt))}</time><b>${esc(labelize(event.action)||'Legacy event')}</b><span>${esc(event.summary||'No summary recorded')}</span><span class="muted">${esc(activityActor(event))} · ${esc(labelize(activityEntity(event)))}</span></div><span class="muted">Details</span></summary>
        <div class="panel-body pad">
          <dl class="activity-meta"><div><dt>Recorded actor</dt><dd>${esc(activityActor(event))}</dd></div><div><dt>Source</dt><dd>${esc(event.source||'Not recorded')}</dd></div><div><dt>Record</dt><dd>${esc(event.entityType||'Not recorded')} · ${esc(event.entityId||'Not recorded')}</dd></div><div><dt>Reason</dt><dd>${esc(reason||'Reason not recorded')}</dd></div>${initiatedBy?`<div><dt>Request or link created by</dt><dd>${esc(initiatedBy)}</dd></div>`:''}</dl>
          ${changes.length?`<h4>Recorded changes</h4><div class="activity-changes">${changes.map(change=>`<div class="activity-change"><b>${esc(labelize(change.key.replaceAll('_',' ')))}</b><div><small>Before</small><pre>${esc(activityValue(change.key,change.before))}</pre></div><div><small>After</small><pre>${esc(activityValue(change.key,change.after))}</pre></div></div>`).join('')}</div>`:`<p class="muted">${fields.length?`Changed fields: ${esc(fields.join(', '))}. Detailed values were not retained for these fields.`:'Field-level changes were not recorded for this event.'}</p>`}
          ${activityRecordButton(event)}<div class="muted activity-id">Event ${esc(event.id||'ID unavailable')}</div>
        </div></details>`;
    }).join(''):emptyState('🕒','No matching activity','Change your filters to see other events.')}
    ${shown.length<events.length?'<button class="btn" onclick="ActivityHistory.more()">Show 100 more</button>':''}
  </div>`;
}
window.ActivityHistory={
  render:renderDetailedActivity,
  filter(key,value){if(!IS_OWNER||!['query','entity','source','from','to'].includes(key))return;activityHistoryState[key]=String(value);activityHistoryState.limit=100;renderPreserveScroll();},
  reset(){Object.assign(activityHistoryState,{query:'',entity:'all',source:'all',from:'',to:'',limit:100});renderPreserveScroll();},
  more(){activityHistoryState.limit+=100;renderPreserveScroll();},
  async refresh(){if(!IS_OWNER||isTechnicianView())return;try{await refreshCollection('auditLog');if(route.page==='auditlog')renderPreserveScroll();}catch(error){toast('Could not refresh activity history. Please try again.',true);}}
};
