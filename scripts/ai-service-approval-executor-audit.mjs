import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=fs.readFileSync(new URL('../supabase/functions/ai-service-document-execute/index.ts',import.meta.url),'utf8');
const checks=[
 ['executor requires approved status',fn.includes('Approval must be approved before execution')],
 ['executor office-gated',fn.includes('Approval execution requires office access')],
 ['executor only persists invoice/estimate',fn.includes('Only invoice and estimate drafts can be persisted')],
 ['executor requires pricing verification',fn.includes('pricing_verified')&&fn.includes('catalog_integrity_verified')],
 ['executor idempotent by approval marker',fn.includes('aiApprovalId')&&fn.includes('already_executed')],
 ['executor writes approval decision metadata',fn.includes('decided_by_team_id')],
 ['UI can approve/reject',ui.includes('decideAiApproval')&&ui.includes('Approve')&&ui.includes('Reject')],
 ['UI can execute approved item',ui.includes('executeAiApproval')&&ui.includes('Create Document')],
 ['UI invokes executor Edge Function',ui.includes("SB.functions.invoke('ai-service-document-execute'" )],
 ['UI refreshes invoices and estimates after execution',ui.includes("refreshCollection('invoices')")&&ui.includes("refreshCollection('estimates')")]
];
let passed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`${passed}/${checks.length} assertions passed`);if(passed!==checks.length)process.exit(1);