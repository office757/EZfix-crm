import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { layoutCalendarIntervals } from './calendar-overlap-layout.mjs';
import { buildCalendarOverlaps, restoreCalendarOverlapSource } from './build-calendar-overlap.mjs';
import { renderCalendarFixture } from './calendar-overlap-fixture.mjs';
const raw=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=restoreCalendarOverlapSource(raw), built=buildCalendarOverlaps(source);
let passed=0;
function check(name,test){test();passed++;console.log('PASS '+name);}
const intervals=(...pairs)=>pairs.map(([start,end],id)=>({id,start,end}));
const lanes=input=>layoutCalendarIntervals(input).map(x=>x.lanes);
check('Empty day',()=>assert.deepEqual(layoutCalendarIntervals([]),[]));
check('One job gets full width',()=>assert.deepEqual(lanes(intervals([0,60])),[1]));
check('Disjoint jobs get full width',()=>assert.deepEqual(lanes(intervals([0,60],[120,180])),[1,1]));
check('Touching endpoints are not overlaps',()=>assert.deepEqual(lanes(intervals([0,60],[60,120])),[1,1]));
check('Two overlapping jobs split width',()=>assert.deepEqual(lanes(intervals([0,120],[60,180])),[2,2]));
check('Afternoon width resets after morning overlap',()=>assert.deepEqual(lanes(intervals([0,120],[60,180],[300,420])),[2,2,1]));
check('Independent clusters have independent widths',()=>assert.deepEqual(lanes(intervals([0,60],[0,60],[120,180],[120,180],[120,180],[300,360])),[2,2,3,3,3,1]));
check('Transitive overlaps stay in one cluster',()=>assert.deepEqual(lanes(intervals([0,90],[60,150],[120,210])),[2,2,2]));
check('Nested jobs reuse available lanes',()=>assert.deepEqual(lanes(intervals([0,240],[60,120],[120,180])),[2,2,2]));
check('Unsorted inputs are supported',()=>assert.deepEqual(layoutCalendarIntervals(intervals([300,360],[0,120],[60,180])).map(x=>x.id),[1,2,0]));
check('Inputs are not mutated',()=>{const input=intervals([0,60],[0,120]).map(Object.freeze);Object.freeze(input);layoutCalendarIntervals(input);assert.deepEqual(input,intervals([0,60],[0,120]));});
check('Invalid geometry is rejected',()=>{for(const input of [null,[{}],intervals([0,0]),intervals([0,NaN]),intervals([Infinity,2])])assert.throws(()=>layoutCalendarIntervals(input));});
check('Same input produces same layout',()=>{const input=intervals([0,100],[0,100],[0,100]);assert.deepEqual(layoutCalendarIntervals(input),layoutCalendarIntervals(input));});
check('Minimum painted heights do not cover each other',()=>assert.deepEqual(lanes(intervals([0,48],[30,78])),[2,2]));
check('250 generated schedules are bounded and collision-free',()=>{
  let seed=117;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let trial=0;trial<250;trial++){
    const input=Array.from({length:25},(_,id)=>{const start=Math.floor(rand()*600);return{id,start,end:start+1+Math.floor(rand()*120)};});
    const result=layoutCalendarIntervals(input);assert.equal(result.length,input.length);
    for(const a of result){assert.ok(a.lane>=0&&a.lane<a.lanes);for(const b of result){if(a.id!==b.id&&a.start<b.end&&b.start<a.end){assert.equal(a.lanes,b.lanes);assert.notEqual(a.lane,b.lane);}}}
  }
});
check('Build is reversible and only changes the approved week sections',()=>assert.equal(restoreCalendarOverlapSource(built),source));
check('Build is idempotent',()=>assert.equal(buildCalendarOverlaps(built),built));
check('Unexpected renderer changes block the build',()=>assert.throws(()=>buildCalendarOverlaps(source.replace('const layoutTimed=d=>{','const renamedLayout=d=>{'))));
check('Missing renderer blocks the build',()=>assert.throws(()=>buildCalendarOverlaps('<html></html>')));
check('All original inline event-handler attributes remain identical',()=>assert.deepEqual([...built.matchAll(/\bon(?:click|change|dragstart|dragover|drop|dblclick)="[^"]*"/g)].map(x=>x[0]),[...source.matchAll(/\bon(?:click|change|dragstart|dragover|drop|dblclick)="[^"]*"/g)].map(x=>x[0])));
check('Built classic application scripts still parse',()=>{for(const m of built.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/\bsrc=|\btype\s*=\s*["'](?:module|application\/ld\+json)/i.test(m[1])&&m[2].trim())new vm.Script(m[2]);}});
const before=renderCalendarFixture(source), after=renderCalendarFixture(built);
const cards=html=>[...html.matchAll(/<button class="cal-hour-job\b[^>]*>/g)].map(x=>x[0]);
const findCard=(html,id)=>cards(html).find(x=>x.includes("openCalendarJobPreview('"+id+"')"));
check('Actual renderer previously squeezed the lone afternoon job',()=>assert.match(findCard(before,'demo-c'),/width:calc\(50% - 8px\)/));
check('Actual renderer now gives the lone afternoon job full width',()=>assert.match(findCard(after,'demo-c'),/width:calc\(100% - 8px\)/));
check('Actual overlapping morning jobs remain split',()=>assert.match(findCard(after,'demo-a'),/width:calc\(50% - 8px\)/));
check('Actual renderer handles a separate triple-overlap day',()=>assert.match(findCard(after,'demo-e'),/width:calc\(33\.333333333333336% - 8px\)/));
check('Actual short appointments cannot visually cover each other',()=>assert.match(findCard(after,'demo-short2'),/width:calc\(50% - 8px\)/));
check('Every timed job still appears exactly once',()=>{assert.equal(cards(after).length,11);assert.equal(cards(after).length,cards(before).length);});
check('Original time, height, status color and drag permissions are unchanged',()=>{
  for(const old of cards(before)){
    const id=old.match(/openCalendarJobPreview\('([^']+)'\)/)[1], next=findCard(after,id);
    for(const pattern of [/top:[^;]+;/,/height:[^;]+;/,/--cal-accent:[^";]+/,/draggable="[^"]*"/,/ondragstart="[^"]*"/])assert.equal(next.match(pattern)[0],old.match(pattern)[0]);
  }
});
check('All-day jobs stay out of the time lane algorithm',()=>{assert.ok(after.includes('Demo All Day'));assert.equal(findCard(after,'demo-all'),undefined);});
check('Short cards receive a compact presentation class',()=>assert.match(findCard(after,'demo-d'),/is-compact/));
check('Full descriptions safely escape names with quotes and markup',()=>{const card=findCard(after,'demo-quote');assert.match(card,/title="Demo &quot;Long Name&quot; &lt;Family&gt; &amp; Sons/);assert.match(card,/aria-label="Demo &quot;Long Name&quot; &lt;Family&gt; &amp; Sons/);});
check('Technician-only visible card set and drag restrictions are preserved',()=>{
  const old=cards(renderCalendarFixture(source,{technician:true})), next=cards(renderCalendarFixture(built,{technician:true}));
  assert.deepEqual(next.map(x=>x.match(/openCalendarJobPreview\('[^']+'\)/)[0]),old.map(x=>x.match(/openCalendarJobPreview\('[^']+'\)/)[0]));
  for(const c of next)assert.match(c,/draggable="false"/);
});
check('Technician filter still shows the same assigned jobs',()=>{
  const ids=html=>cards(html).map(x=>x.match(/openCalendarJobPreview\('[^']+'\)/)[0]);
  assert.deepEqual(ids(renderCalendarFixture(built,{filter:'tech-b'})),ids(renderCalendarFixture(source,{filter:'tech-b'})));
});
console.log(`Calendar overlap audit: ${passed}/${passed} PASS`);
