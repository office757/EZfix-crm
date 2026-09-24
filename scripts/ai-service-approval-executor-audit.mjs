import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=fs.readFileSync(new URL('../supabase/functions/ai-service-document-execute/index.ts',import.meta.url),'utf8');

const checks=[
  ['approvals UI has approve action',ui.includes("decideAiApproval(")&&ui.includes(">Approve</button>")],
  ['approvals UI has reject action',ui.includes(">Reject</button>")],
  ['approved item exposes Create Document',ui.includes("Create Document")&&ui.includes("executeAiApproval(")],
  ['executor requires approved status',fn.includes('if(approval.status!=="approved")')],
  ['executor restricted to office roles',fn.includes('["owner","admin","office","dispatcher"]')],
  ['executor requires pricing verification',fn.includes('pricing_verified!==true')&&fn.includes('catalog_integrity_verified!==true')],
  ['executor is idempotent by approval id',fn.includes('app_data->>aiApprovalId')&&fn.includes('already_executed:true')],
  ['executor uses production invoice numbering RPC',fn.includes('"next_invoice_number"')],
  ['executor uses production estimate numbering RPC',fn.includes('"next_estimate_number"')],
  ['executor persists job link',fn.includes('job_id:jobId')||fn.includes('converted_job_id:jobId')],
  ['executor marks approval executed',fn.includes('status:"executed"')],
  ['executor writes audit event',fn.includes('ai_service_document_executed')],
];
let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`${passed}/${checks.length} assertions passed`);
if(passed!==checks.length)process.exit(1);
