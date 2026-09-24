import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=fs.readFileSync(new URL('../supabase/functions/ai-service-document-execute/index.ts',import.meta.url),'utf8');
const checks=[
 ['executor requires office role',fn.includes('Approval execution requires office access')],
 ['executor requires approved status',fn.includes('Approval must be approved before execution')],
 ['executor only persists invoice/estimate drafts',fn.includes('Only invoice and estimate drafts can be persisted')],
 ['executor requires verified pricing',fn.includes('pricing_verified!==true||proposed.catalog_integrity_verified!==true')],
 ['executor is idempotent by aiApprovalId',fn.includes('app_data->>aiApprovalId')],
 ['executor marks approval executed',fn.includes('status:"executed"')],
 ['approvals UI has Approve',ui.includes('Approve</button>')],
 ['approvals UI has Reject',ui.includes('Reject</button>')],
 ['approved service docs expose Create Document',ui.includes('Create Document')],
 ['UI invokes executor',ui.includes("SB.functions.invoke('ai-service-document-execute'")]
];
let passed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`${passed}/${checks.length} assertions passed`);if(passed!==checks.length)process.exit(1);
