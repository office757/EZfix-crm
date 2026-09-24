import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const exec=fs.readFileSync(new URL('../supabase/functions/ai-service-document-execute/index.ts',import.meta.url),'utf8');
const checks=[
 ['Approvals UI has Approve action',ui.includes("decideAiApproval('")&&ui.includes("'approved'")],
 ['Approvals UI has Reject action',ui.includes("'rejected'")],
 ['Approvals UI has Create Document action',ui.includes('Create Document')],
 ['execution calls Edge Function',ui.includes("SB.functions.invoke('ai-service-document-execute'")],
 ['executor requires approved status',exec.includes('Approval must be approved before execution')],
 ['executor restricts office roles',exec.includes('Approval execution requires office access')],
 ['executor requires verified pricing',exec.includes('pricing_verified!==true')],
 ['executor requires catalog integrity',exec.includes('catalog_integrity_verified!==true')],
 ['executor is idempotent by approval id',exec.includes('app_data->>aiApprovalId')],
 ['executor supports invoices and estimates only',exec.includes('Only invoice and estimate drafts can be persisted')],
 ['executor writes audit trail',exec.includes('ai_service_document_executed')]
];
let passed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`${passed}/${checks.length} assertions passed`);if(passed!==checks.length)process.exit(1);