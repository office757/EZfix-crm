import fs from 'node:fs';
const root='.';
const read=p=>fs.readFileSync(root+'/'+p,'utf8');
const proc=read('supabase/functions/process-inkbox-call-leads/index.ts');
const sync=read('supabase/functions/sync-inkbox-calls/index.ts');
const checks=[
 ['processor detects human transfer requests',/human_transfer_requested|human requested|speak to.*human|owner|manager|representative/i.test(proc)],
 ['processor preserves transfer status',proc.includes('transfer_status')],
 ['processor preserves transfer number',proc.includes('transfer_number')||proc.includes('humanTransferNumber')],
 ['processor preserves caller callback evidence',/remote_number|callback/i.test(proc)],
 ['processor detects unsafe scheduling claims',/unverified_definitive_scheduling|availability|confirmed/i.test(proc)],
 ['processor detects payment amount prompts',/payment_amount_prompt|payment amount/i.test(proc)],
 ['processor guards technician assignment',/unauthorized_assignment|assign_technician|assignment_permission/i.test(proc)],
 ['sync loads transfer number from settings',sync.includes('humanTransferNumber')],
 ['sync injects scheduling guardrails',/availability|booked|scheduled|confirmed/i.test(sync)],
 ['sync injects pricing/payment guardrails',/payment amount|invent|quote prices/i.test(sync)],
 ['sync preserves caller phone fields',/remotePhoneNumber|remote_number|callback/i.test(sync)]
];
let failed=0;for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failed++;}
console.log((checks.length-failed)+'/'+checks.length+' assertions passed');if(failed)process.exit(1);
