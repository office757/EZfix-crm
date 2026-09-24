import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=fs.readFileSync(new URL('../supabase/functions/ai-service-document-execute/index.ts',import.meta.url),'utf8');
const checks=[
 ['executor requires approved status',fn.includes('if(approval.status!=="approved")')],
 ['executor restricted to office roles',fn.includes('["owner","admin","office","dispatcher"]')],
 ['executor supports invoice/estimate only',fn.includes('["invoice_draft","estimate_draft"]')],
 ['executor requires verified pricing',fn.includes('proposed.pricing_verified!==true')],
 ['executor requires catalog integrity',fn.includes('proposed.catalog_integrity_verified!==true')],
 ['executor is idempotent by aiApprovalId',fn.includes('app_data->>aiApprovalId')],
 ['executor records approval evidence',fn.includes('executionEvidence')&&fn.includes('status:"executed"')],
 ['UI can approve',ui.includes("decideAiApproval('${x.id}','approved')")],
 ['UI can reject',ui.includes("decideAiApproval('${x.id}','rejected')")],
 ['UI can execute approved draft',ui.includes("executeAiApproval('${x.id}')")],
 ['UI calls executor edge function',ui.includes("SB.functions.invoke('ai-service-document-execute'" )],
 ['UI refreshes financial documents',ui.includes("refreshCollection('invoices')")&&ui.includes("refreshCollection('estimates')")]
];
let passed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`${passed}/${checks.length} assertions passed`);if(passed!==checks.length)process.exit(1);