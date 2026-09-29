import assert from 'node:assert/strict';
import {rankTechnicians} from '../supabase/functions/_shared/dispatch-ranking.mjs';

// Synthetic inputs only: no network, real accounts, offers or messages.
// Expectations are specified independently of the ranking output.
const id=n=>`demo_dispatch_20260929_${String(n).padStart(2,'0')}`;
const team=Array.from({length:10},(_,i)=>({id:id(i+1),name:`DEMO ${i+1}`,role:'technician',status:'active',auth_user_id:`fixture-only-${i+1}`}));
const specialty={skill:5,closeRate:90,averageTicket:900,durationMinutes:60,materialCost:100};
const profiles=team.map(t=>({technician_id:t.id,profile:{enabled:true,dailyLimit:3,hourlyCost:25,commissionPercent:30,shifts:{3:[420,1200]},specialties:{repair:{...specialty}},travelMinutesByZip:{'01757':90,'01748':90,'01746':90,'02038':90,'02035':90}}}));
const p=n=>profiles[n-1].profile;
p(1).travelMinutesByZip['01757']=10;
p(5).travelMinutesByZip['01757']=35;
p(2).travelMinutesByZip['01748']=20;
p(6).travelMinutesByZip['01748']=5;
p(6).shifts={3:[960,1200]};
p(3).travelMinutesByZip['01746']=20;
p(3).specialties.spring={...specialty};
p(7).travelMinutesByZip['01746']=5;
p(4).travelMinutesByZip['02038']=20;
p(8).travelMinutesByZip['02038']=5;
p(8).dailyLimit=1;
const jobs=[{id:'fixture-capacity',technician_id:id(8),scheduled_date:'2026-09-30',status:'scheduled',appointment_window:'7:00 AM - 8:00 AM'}];
const expectations=[
 {zip:'01757',type:'repair',winner:id(1),reason:'Better travel with otherwise equal business inputs'},
 {zip:'01748',type:'repair',winner:id(2),excluded:id(6),exclusion:'No room in the requested window',reason:'Closer technician outside requested hours'},
 {zip:'01746',type:'spring',winner:id(3),excluded:id(7),exclusion:'Job type not enabled',reason:'Required specialty'},
 {zip:'02038',type:'repair',winner:id(4),excluded:id(8),exclusion:'Daily capacity reached',reason:'Closer technician at daily capacity'},
 {zip:'02035',type:'repair',winner:null,reason:'All technicians outside travel limit'},
];
const results=expectations.map((expected,i)=>{
 const lead={id:`demo-lead-${i+1}`,name:`DEMO Test ${i+1}`,phone:'+12025550123',address:'TEST ONLY',service_requested:expected.type,app_data:{zip:expected.zip,routing_type:expected.type,preferred_appointment:'2026-09-30',preferred_time:'10:00 AM - 2:00 PM'}};
 const result=rankTechnicians({lead,team,profiles,jobs,now:Date.parse('2026-09-29T20:33:00Z')});
 assert.equal(result.winner?.technician_id??null,expected.winner,`Scenario ${i+1}`);
 assert.equal(result.status,expected.winner?'recommended':'held');
 if(expected.excluded)assert.ok(result.candidates.find(c=>c.technician_id===expected.excluded).excluded.includes(expected.exclusion));
 return {scenario:i+1,zip:expected.zip,expected:expected.winner,actual:result.winner?.technician_id??null,status:result.status,reason:expected.reason};
});
const extraLead={id:'demo-lead-6',name:'DEMO business priority',phone:'+12025550123',address:'TEST ONLY',service_requested:'repair',app_data:{zip:'01757',preferred_appointment:'2026-09-30',preferred_time:'10:00 AM - 2:00 PM'}};
const extraJobs=[{id:'already-assigned',technician_id:id(1),scheduled_date:'2026-09-30',status:'scheduled',appointment_window:'7:00 AM - 8:00 AM'}];
const businessProfiles=structuredClone(profiles);
businessProfiles[4].profile.specialties.repair={...specialty,skill:3,closeRate:60,averageTicket:600};
const business=rankTechnicians({lead:extraLead,team,profiles:businessProfiles,jobs:extraJobs,now:Date.parse('2026-09-29T20:33:00Z')});
assert.equal(business.winner?.technician_id,id(1),'Business advantage must allow a second assignment');
assert.ok(business.candidates.find(c=>c.technician_id===id(5)).eligible,'The idle alternative must remain eligible');
results.push({scenario:6,expected:id(1),actual:business.winner.technician_id,status:'passed',reason:'Better business outcome despite already having a scheduled job'});
const equalProfiles=structuredClone(profiles);
equalProfiles[4].profile.travelMinutesByZip['01757']=10;
const balanced=rankTechnicians({lead:{...extraLead,id:'demo-lead-7'},team,profiles:equalProfiles,jobs:extraJobs,now:Date.parse('2026-09-29T20:33:00Z')});
// Equal business scores must account for scheduled assignments as workload.
results.push({scenario:7,expected:id(5),actual:balanced.winner?.technician_id,status:balanced.winner?.technician_id===id(5)?'passed':'failed',reason:'Equal business inputs: prefer technician with no scheduled jobs'});
console.log(JSON.stringify({scope:'Local ranking only; no live dispatch or delivery tested',results},null,2));
if(results.some(r=>r.status==='failed'))process.exitCode=1;

for (const ignored of [{...extraJobs[0],status:'cancelled'},{...extraJobs[0],deleted_at:'2026-09-29T20:00:00Z'},{...extraJobs[0],scheduled_date:'2026-10-07'}]) {
 const r=rankTechnicians({lead:extraLead,team,profiles:equalProfiles,jobs:[ignored],now:Date.parse('2026-09-29T20:33:00Z')});
 assert.equal(r.candidates.find(c=>c.technician_id===id(1)).weeklyJobs,0);
}

const taggedTeam=team.map(t=>({...t,app_data:{demo_batch:'fixture-batch'}}));
const real=rankTechnicians({lead:extraLead,team:taggedTeam,profiles:equalProfiles,now:Date.parse('2026-09-29T20:33:00Z')});
assert.equal(real.candidates.length,0,'Demo techs must not receive real leads');
const demo=rankTechnicians({lead:{...extraLead,app_data:{...extraLead.app_data,demo_batch:'fixture-batch'}},team:[...taggedTeam,{...team[0],id:'real-tech'}],profiles:equalProfiles,now:Date.parse('2026-09-29T20:33:00Z')});
assert.equal(demo.candidates.length,10,'Demo leads must only consider same-batch technicians');
