import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { installAssignmentWhatsApp, stripAssignmentWhatsApp } from './build-assignment-whatsapp.mjs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=stripAssignmentWhatsApp(html);
const built=installAssignmentWhatsApp(source);
let n=0; const check=(name,fn)=>{fn();n++;console.log('PASS '+name)};

check('Build changes only the assignment hook',()=>assert.equal(stripAssignmentWhatsApp(built),source));
check('Build is idempotent',()=>assert.equal(installAssignmentWhatsApp(built),built));
check('Exactly one assignment WhatsApp marker is present',()=>assert.equal((built.match(/EZFIX_ASSIGNMENT_WHATSAPP_V1/g)||[]).length,1));
check('Existing SMS assignment function call remains present',()=>assert.match(built,/send-technician-assignment-sms/));
check('WhatsApp uses existing opt-in aware pipeline',()=>{assert.match(built,/techWantsNotification\(technicianName, 'newJob'\)/);assert.match(built,/await logWaNotification\(/)});
check('Assignment WhatsApp is emitted once per sync call',()=>assert.equal((built.match(/await logWaNotification\(/g)||[]).length,(source.match(/await logWaNotification\(/g)||[]).length+1));
check('No direct Meta credential logic is added',()=>assert.doesNotMatch(built.slice(built.indexOf('EZFIX_ASSIGNMENT_WHATSAPP_V1')-500,built.indexOf('EZFIX_ASSIGNMENT_WHATSAPP_V1')+1400),/graph\.facebook|META_WHATSAPP_TOKEN|service_role/i));
check('Notification failures cannot block the saved assignment',()=>{assert.match(built,/SMS failed without blocking assignment/);assert.match(built,/WhatsApp failed without blocking assignment/)});
check('Classic inline scripts still parse',()=>{for(const m of built.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){const tag=m[0],open=tag.slice(0,tag.indexOf('>')+1);if(/\bsrc=|\btype\s*=\s*["']module/i.test(open))continue;if(m[1].trim())new vm.Script(m[1]);}});
console.log('Assignment WhatsApp audit: '+n+'/'+n+' PASS');
