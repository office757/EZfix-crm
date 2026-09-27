import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const START = '<!-- EZFIX_CALENDAR_PREMIUM_BEGIN -->';
const END = '<!-- EZFIX_CALENDAR_PREMIUM_END -->';

/** Remove only this build's own style block; never rewrite application code. */
export function stripCalendarPremium(html) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start === -1 && end === -1) return html;
  if (start === -1 || end < start || html.indexOf(START, start + START.length) !== -1 || html.indexOf(END, end + END.length) !== -1) {
    throw new Error('Calendar build: malformed or duplicate style markers');
  }
  return html.slice(0, start) + html.slice(end + END.length);
}

/** CSS-only, deterministic build transform for the existing monolithic CRM. */
export function decorateCalendarPremium(html, css) {
  const source = stripCalendarPremium(html);
  if ((source.match(/<\/head>/g) || []).length !== 1) throw new Error('Calendar build: expected one closing head');
  if (!source.includes('function renderCalendarWeek(') || !source.includes('cal-hour-board')) throw new Error('Calendar build: incompatible CRM source');
  if (!css.trim() || /<\/style/i.test(css)) throw new Error('Calendar build: invalid stylesheet');
  const block = `${START}\n<style id="ezfix-calendar-premium">\n${css.trim()}\n</style>\n${END}`;
  const output = source.replace('</head>', `${block}</head>`);
  if (stripCalendarPremium(output) !== source) throw new Error('Calendar build changed content outside its stylesheet');
  return output;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const htmlPath = new URL('../index.html', import.meta.url);
  const cssPath = new URL('../calendar-premium.css', import.meta.url);
  const original = readFileSync(htmlPath, 'utf8');
  const output = decorateCalendarPremium(original, readFileSync(cssPath, 'utf8'));
  if (output !== original) writeFileSync(htmlPath, output, 'utf8');
  console.log('Calendar presentation built; application scripts, event handlers, routing and data logic unchanged.');
}
