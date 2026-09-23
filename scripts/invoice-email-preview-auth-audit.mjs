import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(here, '..', 'supabase', 'functions', 'invoice-email-preview', 'index.ts');
const source = fs.readFileSync(sourcePath, 'utf8');

const checks = [
  ['requires authenticated bearer session', source.includes('if(!auth.startsWith("Bearer "))return json({error:"Unauthorized"},401)')],
  ['requires an active team member', source.includes('.eq("auth_user_id",user.id).eq("status","active").maybeSingle()')],
  ['invoice is loaded through caller-scoped Supabase client', source.includes('await scoped.from("invoices").select(')],
  ['service-role client is not used to load invoices', !source.includes('await db.from("invoices").select(')],
  ['invoice authorization happens before service-role settings reads', source.indexOf('await scoped.from("invoices").select(') > -1 && source.indexOf('await scoped.from("invoices").select(') < source.indexOf('db.from("ai_manager_settings")')],
  ['inaccessible or missing invoice returns not found without settings disclosure', source.includes('if(!i)return json({error:"Invoice not found"},404)')],
  ['payment settings read failures fail closed', source.includes('if(paySettingsError)throw paySettingsError;')],
  ['CRM settings read failures fail closed', source.includes('if(crmSettingsError)throw crmSettingsError;')],
  ['Square checkout host remains exact', source.includes('u.hostname!=="checkout.square.site"')],
  ['Square client reference must still equal invoice number', source.includes('if(String(ref)!==String(invoiceNumber||""))')],
  ['PAY NOW is shown only for verified link with positive balance', source.includes('const button=direct&&a.balance>0?')],
  ['response remains preview-only', source.includes('preview_only:true')],
  ['preview function does not invoke email/SMS providers', !/send-crm-email|send-inkbox-sms|resend\.com|gmail\.googleapis\.com|fetch\s*\(/i.test(source)],
];

let passed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    passed += 1;
    console.log(`PASS: ${name}`);
  }
}

console.log(`${passed}/${checks.length} assertions passed`);
if (passed !== checks.length) process.exit(1);
