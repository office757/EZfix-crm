import fs from 'node:fs';
const root='C:/Users/diboo/ezfix-night';
const read=p=>fs.readFileSync(root+'/'+p,'utf8');
const preview=read('supabase/functions/invoice-email-preview/index.ts');
const manager=read('supabase/functions/ai-manager-tools/index.ts');
const techSms=read('supabase/functions/send-technician-assignment-sms/index.ts');
const wa=read('supabase/functions/whatsapp-webhook/index.ts');
const email=read('supabase/functions/send-crm-email/index.ts');
const checks=[
 ['Square preview attests short link by backend link ID',preview.includes('square_backend_attested_link_id')&&preview.includes('squarePaymentLinkId')],
 ['AI manager attests short link by backend link ID',manager.includes('square_backend_attested_link_id')&&manager.includes('squarePaymentLinkId')],
 ['technician SMS persists pending attempt',techSms.includes('provider_status:"pending"')],
 ['technician SMS persists failure evidence',techSms.includes('provider_status:"failed"')&&techSms.includes('failure_reason:reason')],
 ['technician SMS links customer',techSms.includes('customer_id:job.customer_id')],
 ['technician SMS failed attempts are retryable',techSms.includes('retryable:true')],
 ['WhatsApp webhook verifies HMAC signature',wa.includes('x-hub-signature-256')&&wa.includes('HMAC')],
 ['WhatsApp webhook tracks provider delivery states',wa.includes('"sent","delivered","read","failed"')],
 ['WhatsApp webhook does not shadow URL constructor',wa.includes('SUPABASE_URL')&&!/(^|\n)const URL=/.test(wa)],
 ['invoice email preview loads HTTPS logo setting',preview.includes('email_logo_url')&&preview.includes('<img src=')],
 ['email sender does not use CID attachments',!email.includes('cid:')]
];
let failed=0;for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failed++;}
console.log((checks.length-failed)+'/'+checks.length+' assertions passed');if(failed)process.exit(1);