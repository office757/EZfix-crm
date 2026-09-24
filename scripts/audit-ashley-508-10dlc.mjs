import fs from 'node:fs';
const root='.';
const read=p=>fs.readFileSync(root+'/'+p,'utf8');
const sms=read('supabase/functions/send-inkbox-sms/index.ts');
const tech=read('supabase/functions/send-technician-assignment-sms/index.ts');
const web=read('supabase/functions/website-lead-webhook/index.ts');
const checks=[
 ['customer SMS uses Ashley 508',sms.includes('+15083510523')&&!sms.includes('+14139613223')],
 ['technician SMS uses Ashley 508',tech.includes('+15083510523')&&!tech.includes('+14139613223')],
 ['website consent requires explicit checkbox',web.includes('if(consentChecked(b))')],
 ['website consent records disclosure text',web.includes('CURRENT_SMS_DISCLOSURE')],
 ['website consent records version',web.includes('website-form-641-v1')],
 ['website consent records source URL',web.includes('source_url:sourceUrl')],
 ['website consent records form submission evidence',web.includes('form_submission_id:"web:"+leadId')],
 ['website consent does not create opt-in without explicit checkbox',!web.includes('status:"opted_in"')||web.indexOf('status:"opted_in"')>web.indexOf('if(consentChecked(b))')]
];
let failed=0;for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failed++;}
console.log((checks.length-failed)+'/'+checks.length+' assertions passed');if(failed)process.exit(1);
