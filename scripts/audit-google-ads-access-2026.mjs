import fs from 'node:fs';
const root='.';
const read=p=>fs.readFileSync(root+'/'+p,'utf8');
const readiness=read('supabase/functions/marketing-connector-readiness/index.ts');
const oauth=read('supabase/functions/marketing-oauth-start/index.ts');
const discover=read('supabase/functions/google-ads-discover-accounts/index.ts');
const checks=[
 ['readiness marks developer token optional',readiness.includes('developer_token_required:false')],
 ['readiness API ready depends on OAuth only',readiness.includes('api_ready:googleClientId&&googleClientSecret,')],
 ['OAuth start does not block missing developer token',!oauth.includes('DEVELOPER_TOKEN_MISSING')],
 ['discovery requires OAuth credentials',discover.includes('if(!clientId||!clientSecret)')],
 ['discovery does not require developer token',!discover.includes('!clientId||!clientSecret||!developerToken')],
 ['legacy header is conditional',discover.includes('...(developerToken?{"developer-token":developerToken}:{})')],
 ['discovery remains owner-only',discover.includes('Owner access required')],
 ['discovery remains read-only',discover.includes('write_enabled:false')]
];
let failed=0;
for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failed++;}
console.log((checks.length-failed)+'/'+checks.length+' assertions passed');
if(failed)process.exit(1);
