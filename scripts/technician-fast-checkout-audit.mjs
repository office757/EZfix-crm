import fs from 'node:fs';
const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const checks=[
 ['AI executor captures document type',source.includes("const documentType=data.document_type==='invoice'?'invoice':'estimate'")],
 ['AI executor captures created document id',source.includes("const documentId=data.document?.id||''")],
 ['created document opens automatically',source.includes("go(documentType==='invoice'?'invoices':'estimates',documentId)")],
 ['invoice checkout hint is shown',source.includes("Invoice ready — collect payment with PAY NOW." )],
 ['executor still refreshes invoices',source.includes("refreshCollection('invoices')")],
 ['executor still refreshes estimates',source.includes("refreshCollection('estimates')")]
];
let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`${passed}/${checks.length} assertions passed`);
if(passed!==checks.length)process.exit(1);
