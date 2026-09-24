import fs from 'node:fs';
const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const checks=[
 ['email sender accepts entity metadata',source.includes('entityMeta={}')],
 ['email payload includes entity type',source.includes('entity_type:entityMeta.entityType||undefined')],
 ['email payload includes entity id',source.includes('entity_id:entityMeta.entityId||undefined')],
 ['document emails pass CRM identity',source.includes('{ entityType: col, entityId: id }')],
 ['paid invoice receipt initializes delivery tracking',source.includes("SB.functions.invoke('mark-receipt-delivery'" )],
 ['receipt tracker passes provider message id',source.includes('provider_message_id:sent.providerMessageId')],
 ['invoice store refreshes after receipt marker',source.includes("await refreshCollection('invoices');")],
 ['SMS accepts square.link',source.includes('(?:checkout\\.square\\.site|square\\.link)')]
];
let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`${passed}/${checks.length} assertions passed`);
if(passed!==checks.length)process.exit(1);