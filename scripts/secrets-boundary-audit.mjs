import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const browserFiles=['index.html','auth-shell.html','team-admin.html','set-password.html'];
const forbidden=['SUPABASE_SERVICE_ROLE_KEY','SQUARE_ACCESS_TOKEN','SQUARE_LOCATION_ID','INKBOX_API_KEY','INKBOX_SIGNING_KEY','META_WHATSAPP_TOKEN','META_APP_SECRET','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_ADS_DEVELOPER_TOKEN','RESEND_API_KEY','WEBSITE_SMS_CONSENT_TOKEN','WHATSAPP_WEBHOOK_VERIFY_TOKEN'];
let n=0; const ok=(c,m)=>{assert.ok(c,m);n++;console.log('PASS '+m)};
for(const f of browserFiles){
  const p=path.join(root,f); if(!fs.existsSync(p)) continue;
  const s=fs.readFileSync(p,'utf8');
  for(const key of forbidden) ok(!s.includes(key),`${f} does not reference ${key}`);
}
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
ok(index.includes('const SUPABASE_PROJECT_URL'),'frontend contains public Supabase project URL');
ok(index.includes('const SUPABASE_ANON_KEY'),'frontend contains Supabase publishable key');
const pub=index.match(/const\s+SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);
ok(!!pub && pub[1].startsWith('sb_publishable_'),'frontend Supabase key is publishable format');
ok(!index.includes('service_role'),'frontend does not contain service_role token text');

const fnRoot=path.join(root,'supabase','functions');
const envRefs=new Set();
for(const d of fs.readdirSync(fnRoot,{withFileTypes:true}).filter(x=>x.isDirectory())){
 const p=path.join(fnRoot,d.name,'index.ts'); if(!fs.existsSync(p)) continue;
 const s=fs.readFileSync(p,'utf8');
 for(const m of s.matchAll(/Deno\.env\.get\(["']([^"']+)["']\)/g)) envRefs.add(m[1]);
}
for(const key of ['SUPABASE_SERVICE_ROLE_KEY','SQUARE_ACCESS_TOKEN','INKBOX_API_KEY','META_WHATSAPP_TOKEN','GOOGLE_OAUTH_CLIENT_SECRET','RESEND_API_KEY']) ok(envRefs.has(key),`${key} is read server-side from Edge Function environment`);
const doc=fs.readFileSync(path.join(root,'docs','SECRETS_BOUNDARY.md'),'utf8');
ok(doc.includes('If a secret is ever committed, assume compromise'),'rotation-on-leak rule is documented');
ok(doc.includes('local Vercel CLI is not currently authenticated'),'Vercel env enumeration limitation is documented honestly');
console.log(n+'/'+n+' secrets boundary assertions passed');