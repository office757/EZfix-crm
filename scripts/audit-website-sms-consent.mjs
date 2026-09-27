import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src=readFileSync(new URL('../supabase/functions/website-lead-webhook/index.ts',import.meta.url),'utf8');
let n=0; const check=(name,fn)=>{fn();n++;console.log('PASS '+name)};

check('Avada bracketed SMS field is recognized',()=>assert.match(src,/"sms_consent\[\]"/));
check('Legacy unbracketed SMS field remains supported',()=>assert.match(src,/"sms_consent"/));
check('Consent requires an explicit checked/accepted value',()=>assert.match(src,/\["1","true","yes","on","checked","accepted"\]\.includes\(v\)\|\|v\.includes\("i agree to receive sms"\)/));
check('Website consent is stored as opted_in only inside consentChecked branch',()=>{
  assert.match(src,/if\(consentChecked\(b\)\)\{[\s\S]*status:"opted_in"[\s\S]*source:"website_form"/);
});
check('Consent evidence text and version are persisted',()=>{
  assert.match(src,/consent_text:CURRENT_SMS_DISCLOSURE/);
  assert.match(src,/consent_version:"website-form-641-v1"/);
  assert.match(src,/form_submission_id:"web:"\+leadId/);
});
check('No historical lead backfill exists in webhook',()=>assert.doesNotMatch(src,/update\s+public\.sms_consent|from\("leads"\).*sms_consent/i));
console.log('Website SMS consent audit: '+n+'/'+n+' PASS');
