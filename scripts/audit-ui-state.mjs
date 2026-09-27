import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { UI_STATE_EDITS, buildUiState, stripUiState } from './build-ui-state.mjs';
const source=stripUiState(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
const built=buildUiState(source);
let passed=0;
function check(name,fn){fn();passed++;console.log(`PASS ${name}`);}
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(version='after'){
  const data=new Map();
  let nodes={'.cal-week-grid':{scrollLeft:245,scrollTop:180},'.cal-month-shell':{scrollLeft:120,scrollTop:0}};
  let input={id:'filter',selectionStart:2,selectionEnd:5};
  const log={};
  const ctx={Date,Number,console,UI_STATE_KEY:'ui-test',route:{page:'calendar',id:null},calendarViewMode:'week',calendarMonthCursor:'2026-09-01',calendarWeekStart:'2026-09-27',searchTerms:{calendarTech:'tech-a',calendarSelectedDate:'2026-09-29',calendarJobType:'spring replacement',calendarStatus:'scheduled',calendarMiniMonth:'2026-10-01'},
    sessionStorage:{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)},
    window:{scrollX:12,scrollY:220,scrollTo(x,y){this.scrollX=x;this.scrollY=y;log.windowScroll=[x,y];}},
    document:{querySelector:selector=>nodes[selector]||null,get activeElement(){return input;},getElementById:id=>input?.id===id?input:null},
    render(){
      nodes={'.cal-week-grid':{scrollLeft:0,scrollTop:0},'.cal-month-shell':{scrollLeft:0,scrollTop:0}};
      input={id:'filter',focus(options){log.focus=options;},setSelectionRange(start,end){log.selection=[start,end];}};
    }
  };
  vm.createContext(ctx);vm.runInContext(UI_STATE_EDITS.map(edit=>edit[version]).join('\n'),ctx);
  return {ctx,data,log,get nodes(){return nodes;},set nodes(value){nodes=value;},get input(){return input;},set input(value){input=value;},save(){ctx.saveUiState();return JSON.parse(data.get('ui-test'));},restore(state){data.set('ui-test',typeof state==='string'?state:JSON.stringify(state));ctx.restoreUiState();}};
}
check('Old source reproduces the lost status/type/mini-month regression',()=>{
  const state=fixture('before').save();for(const key of ['calendarJobType','calendarStatus','calendarMiniMonth'])assert.equal(state[key],undefined);
});
check('Old source reproduces the nested-scroll reset',()=>{const f=fixture('before');f.ctx.renderPreserveScroll();assert.equal(f.nodes['.cal-week-grid'].scrollLeft,0);assert.equal(f.nodes['.cal-week-grid'].scrollTop,0);});
check('Status, job type and mini-month are saved',()=>{const s=fixture().save();assert.equal(s.calendarStatus,'scheduled');assert.equal(s.calendarJobType,'spring replacement');assert.equal(s.calendarMiniMonth,'2026-10-01');});
check('All calendar preferences survive a fresh runtime',()=>{const a=fixture(),state=a.save(),b=fixture();b.ctx.searchTerms={};b.restore(state);assert.deepEqual(plain(b.ctx.searchTerms),plain(a.ctx.searchTerms));});
check('Route and record ID survive a refresh',()=>{const f=fixture();f.ctx.route={page:'invoices',id:'demo-invoice'};const s=f.save();f.ctx.route={page:'dashboard',id:null};f.restore(s);assert.deepEqual(plain(f.ctx.route),{page:'invoices',id:'demo-invoice'});});
check('Week cursor and view survive a refresh',()=>{const f=fixture();f.restore(f.save());assert.equal(f.ctx.calendarViewMode,'week');assert.equal(f.ctx.calendarWeekStart,'2026-09-27');});
check('Day view and selected date survive a refresh',()=>{const f=fixture();f.ctx.calendarViewMode='day';f.restore(f.save());assert.equal(f.ctx.calendarViewMode,'day');assert.equal(f.ctx.searchTerms.calendarSelectedDate,'2026-09-29');});
check('Month view and cursor survive a refresh',()=>{const f=fixture();f.ctx.calendarViewMode='month';f.restore(f.save());assert.equal(f.ctx.calendarViewMode,'month');assert.equal(f.ctx.calendarMonthCursor,'2026-09-01');});
check('Cleared filters stay cleared instead of resurrecting old values',()=>{const f=fixture();f.restore({calendarTech:'',calendarJobType:'',calendarStatus:'',calendarMiniMonth:''});for(const key of ['calendarTech','calendarJobType','calendarStatus','calendarMiniMonth'])assert.equal(f.ctx.searchTerms[key],'');});
check('Legacy v1 session state remains readable',()=>{const f=fixture();f.restore({route:{page:'calendar'},calendarViewMode:'week',calendarTech:'legacy:Demo Tech',calendarSelectedDate:'2026-09-30'});assert.equal(f.ctx.route.page,'calendar');assert.equal(f.ctx.searchTerms.calendarTech,'legacy:Demo Tech');assert.equal(f.ctx.searchTerms.calendarStatus,'');});
check('Missing storage does not change the current route',()=>{const f=fixture();f.ctx.restoreUiState();assert.equal(f.ctx.route.page,'calendar');});
check('Malformed JSON does not crash or change the route',()=>{const f=fixture();f.restore('{broken');assert.equal(f.ctx.route.page,'calendar');});
check('Null and array state are ignored',()=>{for(const value of [null,[],[{}]]){const f=fixture();f.restore(value);assert.equal(f.ctx.route.page,'calendar');assert.equal(f.ctx.calendarViewMode,'week');}});
check('Invalid calendar views fall back safely',()=>{const f=fixture();f.restore({calendarViewMode:'not-a-view'});assert.equal(f.ctx.calendarViewMode,'month');});
check('Invalid or impossible stored dates are rejected',()=>{const f=fixture();f.restore({calendarMonthCursor:'2026-13-01',calendarWeekStart:'2026-02-30',calendarSelectedDate:'<bad>',calendarMiniMonth:'2026-09-31'});assert.equal(f.ctx.calendarMonthCursor,null);assert.equal(f.ctx.calendarWeekStart,null);assert.equal(f.ctx.searchTerms.calendarSelectedDate,'');assert.equal(f.ctx.searchTerms.calendarMiniMonth,'');});
check('Valid leap-day dates are preserved',()=>{const f=fixture();f.restore({calendarSelectedDate:'2028-02-29'});assert.equal(f.ctx.searchTerms.calendarSelectedDate,'2028-02-29');f.restore({calendarSelectedDate:'2026-02-29'});assert.equal(f.ctx.searchTerms.calendarSelectedDate,'');});
check('Malformed route and filter values are not coerced to objects',()=>{const f=fixture();f.restore({route:{page:{}},calendarTech:{id:'fake'},calendarStatus:[],calendarJobType:'x'.repeat(513)});assert.equal(f.ctx.route.page,'calendar');assert.equal(f.ctx.searchTerms.calendarTech,'');assert.equal(f.ctx.searchTerms.calendarStatus,'');assert.equal(f.ctx.searchTerms.calendarJobType,'');});
check('Storage access failures remain non-fatal',()=>{const f=fixture();f.ctx.sessionStorage.getItem=()=>{throw Error('blocked');};assert.doesNotThrow(()=>f.ctx.restoreUiState());f.ctx.sessionStorage.setItem=()=>{throw Error('quota');};assert.doesNotThrow(()=>f.ctx.saveUiState());});
check('Only approved UI preference fields are serialized',()=>{const f=fixture();f.ctx.searchTerms.customerRecords=[{secret:'not-serialized'}];f.ctx.access_token='not-serialized';const state=f.save();assert.deepEqual(Object.keys(state).sort(),['route','calendarViewMode','calendarMonthCursor','calendarWeekStart','calendarTech','calendarSelectedDate','calendarJobType','calendarStatus','calendarMiniMonth'].sort());assert.ok(!JSON.stringify(state).includes('not-serialized'));});
check('Week horizontal and vertical scroll survive a rerender',()=>{const f=fixture();f.ctx.renderPreserveScroll();assert.deepEqual(f.nodes['.cal-week-grid'],{scrollLeft:245,scrollTop:180});});
check('Month horizontal scroll survives a rerender',()=>{const f=fixture();f.ctx.renderPreserveScroll();assert.equal(f.nodes['.cal-month-shell'].scrollLeft,120);});
check('Window position is preserved in both axes',()=>{const f=fixture();f.ctx.renderPreserveScroll();assert.deepEqual(f.log.windowScroll,[12,220]);});
check('Focus and text selection are restored without scrolling',()=>{const f=fixture();f.ctx.renderPreserveScroll();assert.deepEqual(plain(f.log.focus),{preventScroll:true});assert.deepEqual(f.log.selection,[2,5]);});
check('Missing or removed scroll containers do not break rendering',()=>{const f=fixture();f.nodes={};f.ctx.render=()=>{f.nodes={};f.input=null;};assert.doesNotThrow(()=>f.ctx.renderPreserveScroll());});
check('A route change never restores another page scroll or focus',()=>{const f=fixture();f.ctx.render=()=>{f.ctx.route={page:'dashboard',id:null};f.nodes={};};f.ctx.renderPreserveScroll();assert.equal(f.log.windowScroll,undefined);assert.equal(f.log.focus,undefined);});
check('Fallback focus cannot override the final scroll restoration',()=>{const f=fixture();f.ctx.render=()=>{f.nodes={'.cal-week-grid':{scrollLeft:0,scrollTop:0}};f.input={id:'filter',focus(options){if(options)throw Error('legacy');f.nodes['.cal-week-grid'].scrollLeft=999;}};};f.ctx.renderPreserveScroll();assert.equal(f.nodes['.cal-week-grid'].scrollLeft,245);});
check('Build only modifies the three approved source fragments',()=>assert.equal(stripUiState(built),source));
check('Build is idempotent',()=>assert.equal(buildUiState(built),built));
check('Unexpected source edits block the build',()=>assert.throws(()=>buildUiState(source.replace(UI_STATE_EDITS[0].before,'function saveUiState(){ /* changed */ }'))));
check('Duplicate and malformed build markers are rejected',()=>{assert.throws(()=>stripUiState(built+'/* EZFIX_UI_STATE_SAVE_V1_START */'));assert.throws(()=>stripUiState(built.replace('/* EZFIX_UI_STATE_SCROLL_V1_END */','')));});
check('Existing restored-route authorization is unchanged',()=>{const start=source.indexOf('function validateRestoredRoute()'),end=source.indexOf('function uid()',start);assert.ok(start>=0&&end>start);assert.ok(built.includes(source.slice(start,end)));assert.ok(built.includes('restoreUiState(); validateRestoredRoute(); render();'));});
check('All existing inline event-handler attributes stay byte-identical',()=>assert.deepEqual([...built.matchAll(/\bon\w+="[^"]*"/g)].map(x=>x[0]),[...source.matchAll(/\bon\w+="[^"]*"/g)].map(x=>x[0])));
check('No auth, business-data writes, extra listeners or network calls are introduced',()=>{for(const edit of UI_STATE_EDITS)assert.doesNotMatch(edit.after,/\b(?:fetch|dbSet|dbAdd|addEventListener|setInterval)\s*\(|\bSB\.|\blocalStorage\b/);});
check('All built classic inline scripts parse',()=>{for(const match of built.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=|\btype\s*=\s*["'](?:module|application\/ld\+json)/i.test(match[1]))continue;if(match[2].trim())new vm.Script(match[2]);}});
console.log(`UI refresh stability audit: ${passed}/${passed} PASS`);
