import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { decorateCalendarPremium, stripCalendarPremium } from './build-calendar-premium.mjs';

const raw = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = stripCalendarPremium(raw);
const css = readFileSync(new URL('../calendar-premium.css', import.meta.url), 'utf8');
const built = decorateCalendarPremium(source, css);
let passed = 0;
function check(name, test) { test(); passed++; console.log(`PASS ${name}`); }
const scripts = html => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[0]);

check('The only HTML change is the removable calendar style block', () => assert.equal(stripCalendarPremium(built), source));
check('All application scripts remain byte-identical', () => assert.deepEqual(scripts(built), scripts(source)));
check('Build is idempotent', () => assert.equal(decorateCalendarPremium(built, css), built));
check('Exactly one calendar stylesheet is installed', () => assert.equal((built.match(/id="ezfix-calendar-premium"/g) || []).length, 1));
check('Missing head is rejected', () => assert.throws(() => decorateCalendarPremium(source.replace('</head>', ''), css)));
check('Duplicate head is rejected', () => assert.throws(() => decorateCalendarPremium(source + '</head>', css)));
check('Invalid style termination is rejected', () => assert.throws(() => decorateCalendarPremium(source, '</style><script>bad</script>')));
check('Empty stylesheet is rejected', () => assert.throws(() => decorateCalendarPremium(source, ' ')));
check('Duplicate markers are rejected', () => assert.throws(() => stripCalendarPremium(built + '<!-- EZFIX_CALENDAR_PREMIUM_BEGIN -->')));
check('Incompatible source is rejected', () => assert.throws(() => decorateCalendarPremium('<head></head>', css)));
check('Stylesheet performs no imports or remote requests', () => assert.doesNotMatch(css, /@import|url\s*\(/i));
check('CSS includes the mobile scroll containment fix', () => assert.match(css, /\.cal-week-grid\.with-all-day\{[^}]*min-width:0/));
check('CSS preserves keyboard focus and reduced-motion support', () => { assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion/); });
check('CSS does not replace hour geometry or job positions', () => {
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/(?:^|,)\s*\.cal-hour-(?:job|time|column)\s*(?:,|$)/.test(rule[1])) assert.doesNotMatch(rule[2], /(?:^|;)\s*(?:top|bottom|left|right|width|height|min-height)\s*:/);
  }
});
check('All non-empty classic inline scripts still parse', () => {
  for (const tag of scripts(built)) {
    const opening = tag.slice(0, tag.indexOf('>') + 1);
    if (/\bsrc=|\btype\s*=\s*["'](?:module|application\/ld\+json)/i.test(opening)) continue;
    const body = tag.slice(opening.length, -9);
    if (body.trim()) new vm.Script(body);
  }
});
console.log(`Calendar premium audit: ${passed}/${passed} PASS`);
