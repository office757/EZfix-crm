import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260925033722_harden_quickpay_job_link.sql',import.meta.url),'utf8');
const checks=[
 ['Quick Payment nav exists',ui.includes("key:'quickpay'")&&ui.includes("label:'Quick Payment'")],
 ['Quick Payment available to technicians',ui.includes("'quickpay','more'")],
 ['Quick Payment route renders',ui.includes("if (route.page === 'quickpay') return renderQuickPay(content, actions)")],
 ['Quick Payment UI restored',ui.includes('function renderQuickPay(content, actions)')],
 ['invoice creation uses backend RPC',ui.includes("SB.rpc('technician_create_quickpay_invoice'")],
 ['SMS consent uses backend RPC',ui.includes("SB.rpc('record_quickpay_sms_consent'")],
 ['job linking uses backend RPC',ui.includes("SB.rpc('technician_link_quickpay_invoice_to_job'")],
 ['offline payment uses backend RPC',ui.includes("SB.rpc('technician_record_quickpay_payment'")],
 ['card path uses canonical PaymentProvider',ui.includes('PaymentProvider.createPaymentLink(id)')],
 ['legacy Square helper removed',!ui.includes('function createSquarePaymentLink(')&&!ui.includes('openVerifiedSquareLink(')&&!ui.includes('squareLinkMatchesCurrentBalance(')],
 ['QuickPay no longer uses browser invoice numbering',!ui.slice(ui.indexOf('function renderQuickPay('),ui.indexOf('let aiManagerState=',ui.indexOf('function renderQuickPay('))).includes("nextNumber('INV'")],
 ['job link migration does not complete jobs',!migration.includes("status='completed'")&&!migration.includes("status = 'completed'")&&!migration.includes('status_history=')],
 ['job link migration only links invoice to job',migration.includes('set job_id = p_job_id')],
 ['job link migration checks assigned technician',migration.includes("v_role = 'technician'")&&migration.includes('v_job.technician_id')],
 ['signed finish-job flow remains present',ui.includes('signJobCompletion(jobId)')&&ui.includes('✓ Finish Job')]
];
let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`${passed}/${checks.length} assertions passed`);
if(passed!==checks.length)process.exit(1);
