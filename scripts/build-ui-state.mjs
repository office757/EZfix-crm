import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Reversible, fail-closed edits to UI preferences and render-time scroll only.
// No business records, permissions, credentials, or auth logic are modified.
export const UI_STATE_EDITS = [
  { name: 'SAVE', before: `function saveUiState(){
  try{
    sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({
      route,
      calendarViewMode: typeof calendarViewMode==='undefined' ? 'month' : calendarViewMode,
      calendarMonthCursor: typeof calendarMonthCursor==='undefined' ? null : calendarMonthCursor,
      calendarWeekStart: typeof calendarWeekStart==='undefined' ? null : calendarWeekStart,
      calendarTech: searchTerms.calendarTech||'',
      calendarSelectedDate: searchTerms.calendarSelectedDate||''
    }));
  }catch(e){}
}`, after: `function saveUiState(){
  try{
    sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({
      route,
      calendarViewMode: typeof calendarViewMode==='undefined' ? 'month' : calendarViewMode,
      calendarMonthCursor: typeof calendarMonthCursor==='undefined' ? null : calendarMonthCursor,
      calendarWeekStart: typeof calendarWeekStart==='undefined' ? null : calendarWeekStart,
      calendarTech: searchTerms.calendarTech||'',
      calendarSelectedDate: searchTerms.calendarSelectedDate||'',
      calendarJobType: searchTerms.calendarJobType||'',
      calendarStatus: searchTerms.calendarStatus||'',
      calendarMiniMonth: searchTerms.calendarMiniMonth||''
    }));
  }catch(e){}
}` },
  { name: 'RESTORE', before: `function restoreUiState(){
  try{
    const raw=sessionStorage.getItem(UI_STATE_KEY); if(!raw)return;
    const s=JSON.parse(raw)||{};
    if(s.route?.page) route={page:String(s.route.page),id:s.route.id||null};
    if(s.calendarTech) searchTerms.calendarTech=String(s.calendarTech);
    if(s.calendarSelectedDate) searchTerms.calendarSelectedDate=String(s.calendarSelectedDate);
    window.__pendingCalendarUiState={
      view:s.calendarViewMode||'month',
      month:s.calendarMonthCursor||null,
      week:s.calendarWeekStart||null
    };
    if(typeof calendarViewMode!=='undefined') calendarViewMode=s.calendarViewMode||'month';
    if(typeof calendarMonthCursor!=='undefined') calendarMonthCursor=s.calendarMonthCursor||null;
    if(typeof calendarWeekStart!=='undefined') calendarWeekStart=s.calendarWeekStart||null;
  }catch(e){}
}`, after: `function restoreUiState(){
  try{
    const raw=sessionStorage.getItem(UI_STATE_KEY); if(!raw)return;
    const s=JSON.parse(raw);
    if(!s || typeof s!=='object' || Array.isArray(s)) return;
    const text=(value,max=512)=>typeof value==='string' && value.length<=max ? value : '';
    const date=value=>{
      if(typeof value!=='string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return '';
      const d=new Date(value+'T12:00:00');
      return Number.isFinite(d.getTime()) && d.getFullYear()===Number(value.slice(0,4)) && d.getMonth()+1===Number(value.slice(5,7)) && d.getDate()===Number(value.slice(8,10)) ? value : '';
    };
    const page=text(s.route?.page,64);
    if(/^[a-z][a-z0-9_-]*$/.test(page)) route={page,id:text(s.route?.id,256)||null};
    searchTerms.calendarTech=text(s.calendarTech,256);
    searchTerms.calendarSelectedDate=date(s.calendarSelectedDate);
    searchTerms.calendarJobType=text(s.calendarJobType);
    searchTerms.calendarStatus=text(s.calendarStatus,64);
    searchTerms.calendarMiniMonth=date(s.calendarMiniMonth);
    const view=['month','week','day'].includes(s.calendarViewMode)?s.calendarViewMode:'month';
    const month=date(s.calendarMonthCursor)||null;
    const week=date(s.calendarWeekStart)||null;
    window.__pendingCalendarUiState={view,month,week};
    if(typeof calendarViewMode!=='undefined') calendarViewMode=view;
    if(typeof calendarMonthCursor!=='undefined') calendarMonthCursor=month;
    if(typeof calendarWeekStart!=='undefined') calendarWeekStart=week;
  }catch(e){}
}` },
  { name: 'SCROLL', before: `function renderPreserveScroll() {
  const y = window.scrollY;
  const active = document.activeElement;
  const activeId = active && active.id;
  const selStart = (active && typeof active.selectionStart === 'number') ? active.selectionStart : null;
  const selEnd = (active && typeof active.selectionEnd === 'number') ? active.selectionEnd : null;
  render();
  window.scrollTo(0,y);
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) {
      el.focus();
      if (selStart!=null && el.setSelectionRange) { try { el.setSelectionRange(selStart, selEnd); } catch(e){} }
    }
  }
}`, after: `function renderPreserveScroll() {
  const x = window.scrollX, y = window.scrollY;
  const beforeRoute = JSON.stringify([route.page,route.id||null]);
  const nestedScroll = ['.cal-week-grid','.cal-month-shell'].map(selector=>{
    const el=document.querySelector(selector);
    return el ? {selector,left:el.scrollLeft,top:el.scrollTop} : null;
  }).filter(Boolean);
  const active = document.activeElement;
  const activeId = active && active.id;
  const selStart = (active && typeof active.selectionStart === 'number') ? active.selectionStart : null;
  const selEnd = (active && typeof active.selectionEnd === 'number') ? active.selectionEnd : null;
  render();
  if(JSON.stringify([route.page,route.id||null])!==beforeRoute) return;
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) {
      try { el.focus({preventScroll:true}); } catch(e) { el.focus(); }
      if (selStart!=null && el.setSelectionRange) { try { el.setSelectionRange(selStart, selEnd); } catch(e){} }
    }
  }
  for(const saved of nestedScroll){
    const el=document.querySelector(saved.selector);
    if(el){ el.scrollLeft=saved.left; el.scrollTop=saved.top; }
  }
  window.scrollTo(x,y);
}` }
];

function occurrences(text, fragment) { return text.split(fragment).length - 1; }
function wrapped(edit) {
  return `/* EZFIX_UI_STATE_${edit.name}_V1_START */\n${edit.after}\n/* EZFIX_UI_STATE_${edit.name}_V1_END */`;
}
export function stripUiState(html) {
  let source = html;
  for (const edit of UI_STATE_EDITS) {
    const start = `/* EZFIX_UI_STATE_${edit.name}_V1_START */`;
    const end = `/* EZFIX_UI_STATE_${edit.name}_V1_END */`;
    if (!source.includes(start) && !source.includes(end)) continue;
    if (occurrences(source,start)!==1 || occurrences(source,end)!==1 || occurrences(source,wrapped(edit))!==1) {
      throw new Error(`UI state build: changed or malformed ${edit.name} markers`);
    }
    source = source.replace(wrapped(edit),edit.before);
  }
  return source;
}
export function buildUiState(html) {
  const source = stripUiState(html);
  let output = source;
  for (const edit of UI_STATE_EDITS) {
    if (occurrences(output,edit.before)!==1) throw new Error(`UI state build: unexpected ${edit.name} source`);
    output = output.replace(edit.before,wrapped(edit));
  }
  if (stripUiState(output)!==source) throw new Error('UI state build changed unapproved content');
  return output;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const path = new URL('../index.html',import.meta.url);
  const original = readFileSync(path,'utf8');
  const built = buildUiState(original);
  if (built!==original) writeFileSync(path,built,'utf8');
  console.log('UI state built: complete calendar filters and nested scroll preservation. Auth, permissions and business data unchanged.');
}
