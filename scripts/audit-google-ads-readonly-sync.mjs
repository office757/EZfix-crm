import fs from 'node:fs';
const root='.';
const read=p=>fs.readFileSync(root+'/'+p,'utf8');
const select=read('supabase/functions/google-ads-select-account/index.ts');
const sync=read('supabase/functions/google-ads-sync-readonly/index.ts');
const ui=read('index.html');
const checks=[
 ['selection requires owner',select.includes('Owner access required')],
 ['selection validates discovered account',select.includes('Choose an account discovered for this connection')],
 ['selection flags no external mutation',select.includes('external_mutation:false')],
 ['sync requires owner',sync.includes('Owner access required')],
 ['sync requires selected account',sync.includes('ACCOUNT_SELECTION_REQUIRED')],
 ['sync uses searchStream',sync.includes('googleAds:searchStream')],
 ['sync has campaign SELECT GAQL',sync.includes('SELECT campaign.id')],
 ['sync has no Google mutate endpoint',!/googleads\.googleapis\.com[^\n]*(mutate|create|remove|update)/i.test(sync)],
 ['sync flags writes disabled',sync.includes('write_enabled:false')],
 ['UI loads discovered accounts',ui.includes("tool:'accounts'")],
 ['UI exposes safe account selector',ui.includes('selectGoogleAdsAccount')],
 ['UI exposes reporting sync',ui.includes('syncGoogleAdsReporting')],
 ['UI keeps live campaign writes disabled',ui.includes('Live campaign writes: disabled')]
];
let failed=0;for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failed++;}
console.log((checks.length-failed)+'/'+checks.length+' assertions passed');if(failed)process.exit(1);
