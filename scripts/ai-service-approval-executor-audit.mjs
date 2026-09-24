import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const decide=fs.readFileSync(new URL('../supabase/functions/ai-approval-decision/index.ts',import.meta.url),'utf8');
const exec=fs.readFileSync(new URL('../supabase/functions/ai-service-document-execute/index.ts',import.meta.url),'utf8');

const checks=[
 ['Approvals UI has approve action',ui.includes("decideAiApproval(")&&ui.includes("'approved'")],
 ['Approvals UI has reject action',ui.includes("decideAiApproval(")&&ui.includes("'rejected'")],
 ['Approved items expose Create Document',ui.includes('Create Document')],
 ['Approval decisions use Edge Function',ui.includes("SB.functions.invoke('ai-approval-decision'")],
 ['Execution uses Edge Function',ui.includes("SB.functions.invoke('ai-service-document-execute'")],
 ['Decision endpoint requires office access',decide.includes('Office approval access required')],
 ['Decision endpoint only changes pending approvals',decide.includes('.eq("status","pending")')],
 ['Executor requires approved status',exec.includes('Approval must be approved before execution')],
 ['Executor validates pricing integrity',exec.includes('pricing_verified')&&exec.includes('catalog_integrity_verified')],
 ['Executor is idempotent by aiApprovalId',exec.includes('aiApprovalId')&&exec.includes('already_executed:true')],
 ['Executor only persists invoice/estimate',exec.includes('Only invoice and estimate drafts can be persisted')],
 ['Executor marks approval executed',exec.includes('status:"executed"')],
 ['Executor writes audit event',exec.includes('ai_service_document_executed')]
];
let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`${passed}/${checks.length} assertions passed`);
if(passed!==checks.length)process.exit(1);
