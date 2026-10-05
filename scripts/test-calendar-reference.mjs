import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const helpers=html.slice(html.indexOf('function calendarClockMinutes('),html.indexOf('function renderCalendarMonth('));
const renderer=html.slice(html.indexOf('function renderCalendarMonth('),html.indexOf('function selectCalendarDay('));
const shift=html.slice(html.indexOf('function shiftCalendarMonth('),html.indexOf('window.shiftCalendarMonth'));
function calendar({month='2026-10-01',selected='2026-10-08',technician=false,jobs=[]}={}){
 const c={Date,window:{},STORE:{jobs},calendarMonthCursor:month,searchTerms:{calendarSelectedDate:selected},todayISO:()=> '2026-10-08',isTechnicianView:()=>technician,technicianOwnsJob:j=>j.technicianId==='mine',calendarTechFilterOptions:()=>[],jobMatchesTechFilter:()=>true,jobStatusAccent:()=>'',getOne:()=>null,esc:v=>String(v??''),labelize:v=>v,saveUiState(){},render(){},payrollDateKey:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
 vm.createContext(c);vm.runInContext(helpers+renderer+shift,c);return c;
}
test('month grids use complete weeks without an extra empty row',()=>{
 for(const [month,count] of [['2026-10-01',35],['2026-02-01',28],['2026-08-01',42]]){
  const c=calendar({month});const content={};c.renderCalendarMonth(content);
  assert.equal((content.innerHTML.match(/aria-label="Select /g)||[]).length,count);
 }
});
test('month changes clamp selected dates through February and year boundaries',()=>{
 const c=calendar({month:'2028-01-01',selected:'2028-01-31'});c.shiftCalendarMonth(1);
 assert.equal(c.calendarMonthCursor,'2028-02-01');assert.equal(c.searchTerms.calendarSelectedDate,'2028-02-29');
 const d=calendar({month:'2026-12-01',selected:'2026-12-31'});d.shiftCalendarMonth(1);
 assert.equal(d.searchTerms.calendarSelectedDate,'2027-01-31');
});
test('technician month and selected-day cards exclude other and deleted jobs',()=>{
 const base={scheduledDate:'2026-10-08',status:'scheduled',appointmentWindow:'8:00 AM'};
 const c=calendar({technician:true,jobs:[{...base,id:'own',title:'OWN SERVICE',technicianId:'mine'},{...base,id:'other',title:'OTHER SERVICE',technicianId:'other'},{...base,id:'deleted',title:'DELETED SERVICE',technicianId:'mine',deletedAt:'2026-10-01'}]});
 const content={};c.renderCalendarMonth(content);assert.match(content.innerHTML,/OWN SERVICE/);assert.doesNotMatch(content.innerHTML,/OTHER SERVICE|DELETED SERVICE|Add new job/);
});
test('selected-day cards sort actual appointments chronologically',()=>{
 const c=calendar({jobs:[{id:'later',scheduledDate:'2026-10-08',appointmentWindow:'1:00 PM',title:'AFTERNOON SERVICE'},{id:'earlier',scheduledDate:'2026-10-08',appointmentWindow:'8:00 AM',title:'MORNING SERVICE'}]});
 const content={};c.renderCalendarMonth(content);const agenda=content.innerHTML.slice(content.innerHTML.indexOf('<aside class="cal-agenda"'));
 assert(agenda.indexOf('MORNING SERVICE')<agenda.indexOf('AFTERNOON SERVICE'));
});
