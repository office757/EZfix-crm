import vm from 'node:vm';
// Synthetic data only. Execute the actual renderer without auth, network or DB access.
export function renderCalendarFixture(html, { technician = false, filter = '' } = {}) {
  const jobs = [
    {id:'demo-a',customerName:'Demo Wilson',appointmentWindow:'9:00 AM - 11:00 AM',technicianId:'tech-a'},
    {id:'demo-b',customerName:'Demo Taylor',appointmentWindow:'10:00 AM - 12:00 PM',technicianId:'tech-b'},
    {id:'demo-c',customerName:'Demo Morgan',appointmentWindow:'1:00 PM - 3:00 PM',technicianId:'tech-a'},
    {id:'demo-d',customerName:'Demo Parker',appointmentWindow:'3:00 PM - 3:45 PM',technicianId:'tech-b'},
    {id:'demo-all',customerName:'Demo All Day',appointmentWindow:'Time TBD',technicianId:'tech-a'},
    {id:'demo-e',customerName:'Demo Smith',appointmentWindow:'9:00 AM - 11:00 AM',scheduledDate:'2026-09-28',technicianId:'tech-a'},
    {id:'demo-f',customerName:'Demo Brooks',appointmentWindow:'10:00 AM - 12:00 PM',scheduledDate:'2026-09-28',technicianId:'tech-b'},
    {id:'demo-g',customerName:'Demo Casey',appointmentWindow:'10:30 AM - 11:30 AM',scheduledDate:'2026-09-28',technicianId:'tech-a'},
    {id:'demo-h',customerName:'Demo Avery',appointmentWindow:'3:00 PM - 5:00 PM',scheduledDate:'2026-09-28',technicianId:'tech-b'},
    {id:'demo-short1',customerName:'Short appointment',appointmentWindow:'8:00 AM - 8:15 AM',scheduledDate:'2026-09-29',technicianId:'tech-a'},
    {id:'demo-short2',customerName:'Following appointment',appointmentWindow:'8:30 AM - 9:00 AM',scheduledDate:'2026-09-29',technicianId:'tech-a'},
    {id:'demo-quote',customerName:'Demo "Long Name" <Family> & Sons',appointmentWindow:'10:00 AM - 12:00 PM',scheduledDate:'2026-09-30',technicianId:'tech-b'}
  ].map((j,i)=>({scheduledDate:'2026-09-27',status:['scheduled','in_progress','waiting_for_parts','completed'][i%4],title:['Spring replacement','Opener repair','Door installation'][i%3],...j,customerId:j.id,technician:j.technicianId==='tech-a'?'Demo Tech A':'Demo Tech B'}));
  const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const context = {
    Date, console, STORE:{jobs}, searchTerms:{calendarTech:filter}, calendarWeekStart:'2026-09-27', VIEW_AS:'',
    IS_OWNER:!technician,CURRENT_TEAM_MEMBER:{id:technician?'tech-a':'owner',role:technician?'technician':'owner',status:'active'},
    JOB_STATUSES:['scheduled','in_progress','waiting_for_parts','completed','cancelled'],
    todayISO:()=> '2026-09-27', isTechnicianView:()=>technician, esc:escape,
    calendarTechFilterOptions:()=>[{value:'tech-a',label:'Demo Tech A'},{value:'tech-b',label:'Demo Tech B'}],
    jobMatchesTechFilter:(job,tech)=>!tech||job.technicianId===tech,
    getOne:()=>({address:'Demo address, Massachusetts'}),
    labelize:text=>String(text).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()),
    jobStatusAccent:status=>({scheduled:'#3b82f6',in_progress:'#f59e0b',waiting_for_parts:'#a855f7',completed:'#22a06b',cancelled:'#ef4444'}[status]),
    formatCalendarClock:h=>Math.floor(h)+':'+String(Math.round((h%1)*60)).padStart(2,'0'),
    addDays:(value,n)=>{const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
  };
  const start=html.indexOf('function renderCalendarWeek(content) {'), end=html.indexOf('\nfunction shiftCalendarMiniMonth(n)',start);
  if(start<0||end<=start)throw Error('Fixture could not locate week renderer');
  const storedBefore=JSON.stringify(context.STORE);
  const identityStart=html.indexOf('function technicianWorkspaceId()'),identityEnd=html.indexOf('function isMarketingManager()',identityStart);
  if(identityStart<0||identityEnd<=identityStart)throw Error('Fixture could not locate technician identity helpers');
  vm.createContext(context);vm.runInContext(html.slice(identityStart,identityEnd)+html.slice(start,end),context);
  const content={innerHTML:''};context.renderCalendarWeek(content);
  if(JSON.stringify(context.STORE)!==storedBefore)throw Error('Renderer mutated synthetic jobs');
  return content.innerHTML;
}
