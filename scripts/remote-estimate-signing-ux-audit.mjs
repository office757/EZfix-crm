import fs from 'node:fs';

const page=fs.readFileSync('estimate-sign.html','utf8');
const client=fs.readFileSync('estimate-signing-client.js','utf8');
const edge=fs.readFileSync('supabase/functions/send-estimate-signing-email/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260926093050_remote_estimate_signing.sql','utf8');

let pass=0,fail=0;
const check=(name,ok,detail='')=>{if(ok){pass++;console.log('PASS '+name)}else{fail++;console.error('FAIL '+name+(detail?': '+detail:''))}};

check('public page is noindex',/noindex,nofollow/.test(page));
check('public page validates 64-hex token before RPC',/\^\[0-9a-fA-F\]\{64\}\$/.test(page));
check('public page uses only signing read/sign RPCs',/get_public_estimate_signing_page/.test(page)&&/sign_public_estimate/.test(page));
check('public page contains no service role secret',!/SERVICE_ROLE|service_role/i.test(page));
check('public page has mobile viewport',/viewport-fit=cover/.test(page));
check('public page signature canvas disables browser gesture drawing conflicts',/touch-action:none/.test(page));
check('public page requires signer name and actual drawn signature',/Please enter the signer name/.test(page)&&/Please add a signature/.test(page));
check('public page removes token from address bar after success',/history\.replaceState\(null,'',location\.pathname\)/.test(page));
check('public page tax calculation uses tax rate divided by 100',/taxable\*ratio\*\(\(Number\(e\.tax_rate\)\|\|0\)\/100\)/.test(page));
check('email function requires authenticated bearer token',/auth\.startsWith\("Bearer "\)/.test(edge));
check('email function validates active team membership',/eq\("status","active"\)/.test(edge));
check('email function derives recipient from estimate/customer',/estimate\.customer_email/.test(edge)&&/from\("customers"\)/.test(edge));
check('email function does not accept arbitrary recipient from request body',!/body\?\.to|body\.to/.test(edge));
check('email function gets token from protected issuance RPC',/issue_public_estimate_signing_token/.test(edge));
check('email function requires configured public base URL',/CRM_PUBLIC_BASE_URL/.test(edge));
check('email function revokes token after provider rejection',/provider rejected the signing email/.test(edge)&&/revoked_at/.test(edge));
const successReturn=(edge.split('return out({ok:true')[1]||'').split(';')[0];
check('email response never returns raw token or signing URL',!!successReturn&&!/token|link|url/i.test(successReturn));
check('CRM client calls protected signing email function',/send-estimate-signing-email/.test(client));
check('CRM client does not construct raw signing tokens',!/token=|issue_public_estimate_signing_token/.test(client));
check('migration hash-protects signed commercial snapshot',/estimate_snapshot_hash/.test(migration)&&/Estimate changed after this signing link was issued/.test(migration));

console.log(`${pass}/${pass+fail} remote signing UX/integration assertions passed`);
if(fail)process.exit(1);
