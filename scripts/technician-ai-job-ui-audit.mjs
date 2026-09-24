import fs from 'node:fs';
const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const checks=[
 ['job exposes AI Service Assistant',source.includes('AI Service Assistant')],
 ['UI calls technician assistant function',source.includes("SB.functions.invoke('ai-technician-assistant'" )],
 ['UI calls approval function',source.includes("SB.functions.invoke('ai-service-document-approval'" )],
 ['draft must reconcile before submit',source.includes('result.catalog_pricing_complete&&result.target_matches_catalog&&result.reconciled')],
 ['job context is sent',source.includes('job_id:jobId')],
 ['voice dictation is optional',source.includes('window.SpeechRecognition||window.webkitSpeechRecognition')],
 ['unsupported voice falls back to typing',source.includes('Type the request instead')],
 ['approval audit is logged',source.includes('ai_document_approval_requested')]
];
let passed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`${passed}/${checks.length} assertions passed`);if(passed!==checks.length)process.exit(1);