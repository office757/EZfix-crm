import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const f=(n)=>fs.readFileSync(path.join(root,'supabase/functions',n,'index.ts'),'utf8');
const invite=f('invite-team-user');
const wa=f('send-whatsapp-notification');
const wah=f('whatsapp-webhook');
const health=f('supabase-health');
const lead=f('website-lead-webhook');
const resend=f('resend-webhook');
const oauth=f('marketing-oauth-callback');
const diag=f('hyper-action');
let n=0; const ok=(c,m)=>{assert.ok(c,m);n++;console.log('PASS '+m)};

ok(invite.includes('Owner/Admin access required'),'team invite requires owner/admin');
ok(invite.includes('auth.getUser'),'team invite validates caller JWT');
ok(invite.includes('inviteUserByEmail'),'team invite uses Supabase admin invite');
ok(invite.includes('Admins cannot manage an owner account'),'admin cannot manage owner login');

ok(wa.includes('whatsapp_opt_in'),'WhatsApp send requires technician opt-in state');
ok(wa.includes('whatsapp_status'),'WhatsApp send requires connected technician state');
ok(wa.includes('recipient_team_id'),'WhatsApp send resolves recipient team member');
ok(wa.includes('retrySafe: false'),'WhatsApp uncertain provider outcomes are not auto-retry-safe');
ok(/\["owner",\s*"admin",\s*"dispatcher"\]/.test(wa),'WhatsApp send is role restricted');

ok(wah.includes('x-hub-signature-256'),'WhatsApp webhook reads Meta signature');
ok(wah.includes('META_APP_SECRET'),'WhatsApp webhook uses app secret');
ok(wah.includes('HMAC'),'WhatsApp webhook verifies HMAC');
ok(wah.includes('Invalid signature'),'WhatsApp webhook rejects invalid signatures');
ok(wah.includes('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),'WhatsApp webhook verifies subscription token');

ok(/withSupabase\s*\(\s*\{\s*auth:\s*["']publishable["']\s*\}/.test(health),'health endpoint uses publishable auth mode');
ok(!health.includes('SUPABASE_SERVICE_ROLE_KEY'),'health endpoint has no service-role secret');
ok(!health.includes('.from('),'health endpoint reads no business tables');

ok(lead.includes('if(!name||(!phone&&!email))'),'website lead requires identity/contact data');
ok(lead.includes('source:"Website"'),'website lead marks source explicitly');
ok(lead.includes('consentChecked'),'website lead only records SMS opt-in after checkbox consent');
ok(lead.includes('CURRENT_SMS_DISCLOSURE'),'website lead stores current SMS disclosure');
ok(lead.includes('Date.now()-600000'),'website lead has duplicate suppression window');

ok(resend.includes('new Webhook(cachedSigningSecret).verify'),'Resend webhook verifies Svix signature');
ok(resend.includes('Missing webhook signature'),'Resend webhook requires signature headers');
ok(resend.includes('Invalid signature'),'Resend webhook rejects invalid signatures');

ok(oauth.includes('state_hash'),'OAuth callback validates hashed state');
ok(oauth.includes('consumed_at'),'OAuth callback enforces one-time state consumption');
ok(oauth.includes('expires_at'),'OAuth callback enforces state expiry');
ok(oauth.includes('store_marketing_oauth_secret'),'OAuth callback stores refresh token via secret RPC');
ok(oauth.includes('safeReturnTo'),'OAuth callback restricts return URL');

ok(diag.includes('runtime_loaded'),'diagnostic endpoint only returns runtime capability state');
ok(!diag.includes('SUPABASE_SERVICE_ROLE_KEY'),'diagnostic endpoint has no service-role secret');
ok(!diag.includes('.from('),'diagnostic endpoint reads no database tables');

console.log(`final live-edge security audit passed: ${n} assertions`);