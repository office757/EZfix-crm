import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function fmtDate('),end=html.indexOf('\nfunction toast(',start);
if(start<0||end<start)throw new Error('Date formatter not found');
const test=`import assert from 'node:assert/strict';
${html.slice(start,end)}
assert.equal(fmtDate('2026-09-28'),'Sep 28, 2026');
assert.equal(fmtDate('2026-03-08'),'Mar 8, 2026');
assert.equal(fmtDate('2026-11-01'),'Nov 1, 2026');
assert.equal(fmtDate('2028-02-29'),'Feb 29, 2028');
assert.equal(fmtDate('8250-02-26'),'Feb 26, 8250');
assert.equal(fmtDate(null),'—');
assert.equal(fmtDate('invalid'),'invalid');
const stamp='2026-09-28T01:00:00Z';
assert.equal(fmtDate(stamp),new Date(stamp).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}));`;
for(const zone of ['America/New_York','America/Los_Angeles','UTC','Asia/Tokyo']){
 execFileSync(process.execPath,['--input-type=module','-e',test],{env:{...process.env,TZ:zone},stdio:'inherit'});
}
console.log('Date display: 32 real-formatter assertions PASS in four time zones; date-only values retain their calendar day');
