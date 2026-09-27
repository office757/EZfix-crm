import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { layoutCalendarIntervals } from './calendar-overlap-layout.mjs';

const OLD_LAYOUT = `  const layoutTimed=d=>{
    const items=timed(d).map(j=>({job:j,wt:windowTimes(j)})).sort((a,b)=>a.wt.start-b.wt.start||a.wt.end-b.wt.end);
    const laneEnds=[];
    items.forEach(x=>{let lane=laneEnds.findIndex(end=>end<=x.wt.start);if(lane<0)lane=laneEnds.length;laneEnds[lane]=x.wt.end;x.lane=lane;});
    const lanes=Math.max(1,laneEnds.length);
    return items.map(x=>({job:x.job,wt:x.wt,lane:x.lane,lanes}));
  };`;
const NEW_LAYOUT = `  // EZFIX_CALENDAR_OVERLAPS_V1: independent groups, using actual painted card bounds.
  const layoutTimed=d=>{
    const layout=${layoutCalendarIntervals.toString()};
    const items=timed(d).map(j=>{
      const wt=windowTimes(j),st=Math.max(8,Math.min(18.25,wt.start)),en=Math.max(st+.75,Math.min(19,wt.end));
      const start=(st-8)*60,height=Math.max(48,(en-st)*60-6);
      return {job:j,wt,start,end:start+height};
    });
    return layout(items);
  };`;
const OLD_CARD = '<button class="cal-hour-job tone-${toneForJob(j)}" draggable=';
const DESCRIPTION = "${esc([j.customerName||'Customer',j.appointmentWindow||'Time TBD',labelize(j.status),j.title||'Service',address,j.technician||'Unassigned'].filter(Boolean).join(' · '))}";
const NEW_CARD = '<button class="cal-hour-job tone-${toneForJob(j)} ${item.lanes>1?\'is-overlapping\':\'\'} ${height<64?\'is-compact\':\'\'}" title="'+DESCRIPTION+'" aria-label="'+DESCRIPTION+'" draggable=';

const OLD_TEMPLATE = '  content.innerHTML=`\n    <div class="cal-week-toolbar">';
const NEW_TEMPLATE = '  content.innerHTML=`\n    <style id="ezfix-calendar-overlap-cards">\n      .cal-hour-job.is-overlapping .cal-hour-job-status{display:none}\n      .cal-hour-job.is-compact .cal-hour-job-meta,.cal-hour-job.is-compact .cal-hour-job-address{display:none}\n    </style>\n    <div class="cal-week-toolbar">';

function replaceExactlyOnce(text, before, after, name) {
  if (text.split(before).length !== 2) throw new Error('Calendar overlap build: unexpected '+name+' source; review before deploying');
  return text.replace(before, () => after);
}
function transform(html, reverse) {
  const anchor = 'function renderCalendarWeek(content) {';
  const endAnchor = '\nfunction shiftCalendarMiniMonth(n)';
  const start = html.indexOf(anchor), end = html.indexOf(endAnchor, start);
  if (start < 0 || end <= start || html.indexOf(anchor, start + anchor.length) !== -1) throw new Error('Calendar overlap build: week renderer boundaries changed');
  const original = html.slice(start, end);
  let section = original;
  for (const [oldText, newText, name] of [[OLD_LAYOUT, NEW_LAYOUT, 'layout'], [OLD_CARD, NEW_CARD, 'card'], [OLD_TEMPLATE, NEW_TEMPLATE, 'card styles']]) {
    const [from, to] = reverse ? [newText, oldText] : [oldText, newText];
    if (!section.includes(from) && section.split(to).length === 2) continue;
    section = replaceExactlyOnce(section, from, to, name);
  }
  return html.slice(0, start) + section + html.slice(end);
}
export const restoreCalendarOverlapSource = html => transform(html, true);
export const buildCalendarOverlaps = html => transform(html, false);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const path = new URL('../index.html', import.meta.url);
  const original = readFileSync(path, 'utf8'), output = buildCalendarOverlaps(original);
  if (restoreCalendarOverlapSource(output) !== restoreCalendarOverlapSource(original)) throw new Error('Calendar overlap build escaped its approved scope');
  if (output !== original) writeFileSync(path, output, 'utf8');
  console.log('Calendar overlap layout and card descriptions built; scheduling handlers and stored data untouched.');
}
