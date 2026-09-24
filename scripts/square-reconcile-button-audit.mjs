import fs from 'node:fs';
const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const checks=[
 ['reconcile helper exists',source.includes('async function syncSquareInvoicePayment(invoiceId)')],
 ['helper calls provider sync',source.includes('PaymentProvider.syncPaymentStatus(invoiceId)')],
 ['helper re-renders invoice',source.includes("renderDocumentView('invoice', invoiceId)")],
 ['Square invoices expose Check Square button',source.includes('↻ Check Square')],
 ['button limited to Square invoices',source.includes("String(doc.paymentProvider||'').toLowerCase()==='square' && balance>0")],
 ['stale no-live-Square comment removed',!source.includes('We have no live Square API connection in this environment')]
];
let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`${passed}/${checks.length} assertions passed`);
if(passed!==checks.length)process.exit(1);
