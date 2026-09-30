import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseWindow} from '../supabase/functions/_shared/dispatch-ranking.mjs';
import {renderCalendarFixture} from './calendar-overlap-fixture.mjs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return html.slice(a,b);}
const helpers=section('function calendarClockMinutes(','function renderCalendarMonth(');
const jobs=[
  {id:'afternoon',customerName:'Afternoon visit',appointmentWindow:'2–4 PM'},
  {id:'ten',customerName:'Ten oclock visit',appointmentWindow:'10–12 PM'},
  {id:'unknown',customerName:'Unscheduled time',appointmentWindow:'Time TBD'},
  {id:'morning',customerName:'Morning visit',appointmentWindow:'8 AM - 10 AM'},
  {id:'early',customerName:'Early visit',appointmentWindow:'08:30–09:30'}
].map(j=>({...j,scheduledDate:'2026-09-27',technicianId:'tech-a',status:'scheduled',title:'Service'}));
function runtime(){
  const c={Date,STORE:{jobs:structuredClone(jobs)},window:{},calendarMonthCursor:'2026-09-01',calendarWeekStart:'2026-09-27',searchTerms:{calendarSelectedDate:'2026-09-27'},todayISO:()=> '2026-09-27',isTechnicianView:()=>false,calendarTechFilterOptions:()=>[],jobMatchesTechFilter:()=>true,jobStatusAccent:()=>'',getOne:(_,id)=>c.STORE.jobs.find(j=>j.id===id),esc:v=>String(v??''),labelize:v=>v,addDays:(_,n)=>n<0?'2026-09-26':'2026-09-28',showModal:options=>{c.modal=options;},document:{getElementById:()=>({})},dbSet:async(collection,id,update)=>{c.saved={collection,id,update};},logAudit:()=>{},toast:()=>{},fmtDate:value=>value};
  vm.createContext(c);vm.runInContext(helpers,c);return c;
}
function inOrder(text,names){let prior=-1;for(const name of names){const position=text.indexOf(name);assert.ok(position>prior,`${name} must follow the previous appointment`);prior=position;}}
test('calendar interprets the actual shorthand, explicit and 24-hour formats',()=>{
  const c=runtime();for(const [text,expected] of [['2–4 PM',[840,960]],['8 AM - 10 AM',[480,600]],['10–12 PM',[600,720]],['11–2 PM',[660,840]],['12–2 PM',[720,840]],['08:30–09:30',[510,570]],['12 AM - 1 AM',[0,60]]])assert.deepEqual(Array.from(c.calendarWindowMinutes(text)),expected,text);
});
test('calendar and server dispatch agree on supported ranges',()=>{
  const c=runtime();for(const text of ['2–4 PM','8–10 AM','10–12 PM','11–2 PM','12–2 PM','8:30 a.m. to 10:15 a.m.','08:00–10:00','morning','afternoon','evening'])assert.deepEqual(Array.from(c.calendarWindowMinutes(text)),parseWindow(text),text);
});
test('invalid or reversed windows remain untimed',()=>{
  const c=runtime();for(const text of ['','Time TBD','tomorrow','25:00–26:00','8:75 AM - 10 AM','0 PM - 2 PM','4 PM - 2 PM','9 PM - 9 PM'])assert.equal(c.calendarWindowMinutes(text),null,text);
});
test('single valid start time retains the previous one-hour display duration',()=>{
  const c=runtime();assert.deepEqual(Array.from(c.calendarWindowMinutes('8:30 AM')),[510,570]);
});
test('numeric chronological ordering keeps unknown times last without changing stored jobs',()=>{
  const c=runtime(),before=JSON.stringify(c.STORE.jobs),sorted=[...c.STORE.jobs].sort(c.calendarJobTimeOrder);
  assert.deepEqual(Array.from(sorted,j=>j.id),['morning','early','ten','afternoon','unknown']);assert.equal(JSON.stringify(c.STORE.jobs),before);
});
test('month cells and selected-day agenda show morning before afternoon',()=>{
  const c=runtime(),content={};vm.runInContext(section('function renderCalendarMonth(','function selectCalendarDay('),c);c.renderCalendarMonth(content);
  const [cells,agenda]=content.innerHTML.split('aria-label="Selected day schedule"');
  inOrder(cells,['Morning visit','Early visit','Ten oclock visit']);assert.ok(!cells.includes('Afternoon visit'));
  inOrder(agenda,['Morning visit','Early visit','Ten oclock visit','Afternoon visit','Unscheduled time']);
});
test('day view and day popup show the same chronological order',()=>{
  const c=runtime(),content={};vm.runInContext(section('function renderCalendarDay(','function openJobModalForDate(')+section('function openCalendarDay(','window.openCalendarDay'),c);
  c.renderCalendarDay(content);c.openCalendarDay('2026-09-27');
  for(const text of [content.innerHTML,c.modal.body])inOrder(text,['Morning visit','Early visit','Ten oclock visit','Afternoon visit','Unscheduled time']);
});
test('week grid places 2–4 PM at 2 PM with its full two-hour height',()=>{
  const output=renderCalendarFixture(html,{jobs});const cards=[...output.matchAll(/<button class="cal-hour-job\b[^>]*>/g)].map(x=>x[0]);
  const card=cards.find(x=>x.includes("openCalendarJobPreview('afternoon')"));assert.ok(card);assert.match(card,/top:360px/);assert.match(card,/height:114px/);
  const early=cards.find(x=>x.includes("openCalendarJobPreview('early')"));assert.ok(early);assert.match(early,/top:30px/);
  assert.equal(cards.length,4);assert.ok(!cards.some(x=>x.includes("openCalendarJobPreview('unknown')")));assert.match(output,/Unscheduled time/);
});
test('dragging a shorthand appointment preserves its two-hour duration in the saved request',async()=>{
  const c=runtime();vm.runInContext(section('function formatCalendarClock(','async function handleJobDrop(')+section('async function handleJobTimeDrop(','window.handleJobDrop'),c);
  await c.handleJobTimeDrop({preventDefault(){},dataTransfer:{getData:()=> 'afternoon'},currentTarget:{getBoundingClientRect:()=>({height:660,top:0})},clientY:120},'2026-09-28');
  assert.equal(c.saved.collection,'jobs');assert.equal(c.saved.id,'afternoon');assert.equal(c.saved.update.scheduledDate,'2026-09-28');assert.equal(c.saved.update.appointmentWindow,'10 AM - 12 PM');
});
