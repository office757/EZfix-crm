import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root,'supabase','migrations');
const files = fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
const sql = files.map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n\n');
let checks=0, failures=0;
const pass=(name)=>{checks++;console.log('PASS '+name);};
const fail=(name,msg)=>{checks++;failures++;console.error('FAIL '+name+': '+msg);};
const req=(name,ok,msg)=>ok?pass(name):fail(name,msg);

const definerBlocks = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-zA-Z0-9_]+)\s*\(([^)]*)\)[\s\S]*?security\s+definer[\s\S]*?\$function\$/gi)].map(m=>({name:m[1],args:m[2],body:m[0]}));
req('SECURITY DEFINER functions are versioned', definerBlocks.length>0, 'No SECURITY DEFINER functions found');
for (const fn of definerBlocks) {
  req(fn.name+' pins search_path', /set\s+search_path\s+(?:=|to)\s+/i.test(fn.body), 'Missing explicit search_path');
}

req('QuickPay legacy overload is revoked from authenticated', /revoke\s+execute\s+on\s+function\s+public\.technician_create_quickpay_invoice\s*\(\s*text\s*,\s*text\s*,\s*text\s*,\s*text\s*,\s*text\s*,\s*jsonb\s*,\s*numeric\s*,\s*text\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql), 'Legacy 8-argument QuickPay creator is still reachable');
req('Future public functions do not inherit Data API EXECUTE', /alter\s+default\s+privileges\s+in\s+schema\s+public[\s\S]{0,250}?revoke\s+execute\s+on\s+functions\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql), 'Default function EXECUTE privileges are not revoked');
req('Public invoice token is validated as 64 hex chars', /p_access_token\s*!~\s*'\^\[0-9a-fA-F\]\{64\}\$'/i.test(sql), 'Public invoice access token format validation is missing');
req('Public invoice access token is hashed before lookup', /digest\s*\(\s*lower\s*\(\s*p_access_token\s*\)\s*,\s*'sha256'\s*\)/i.test(sql), 'Public invoice token lookup is not hash-based');
req('Public invoice token requires non-revoked record', /revoked_at\s+is\s+null/i.test(sql), 'Token revocation check is missing');
req('Public invoice token requires unexpired record', /expires_at\s*>\s*now\(\)/i.test(sql), 'Token expiry check is missing');

// Customer-facing RPCs intentionally accept anonymous callers with a document token.
// Require exact signatures and inspect each latest implementation, including wrappers.
const publicEndpoints = new Map([
  ['get_public_invoice_payment_page','text,text'],
  ['get_public_estimate_signing_page','text,text'],
  ['sign_public_invoice','text,text,text,text,text'],
  ['sign_public_estimate','text,text,text,text,text']
]);
const dangerousPublicGrants = [];
for (const m of sql.matchAll(/grant\s+execute\s+on\s+function\s+public\.([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s+to\s+anon/gi)) {
  if (publicEndpoints.get(m[1]) !== m[2].replace(/\s/g,'')) dangerousPublicGrants.push(m[1]);
}
req('Only exact token-protected anonymous RPC signatures are granted', dangerousPublicGrants.length===0, 'Unexpected anon grants: '+dangerousPublicGrants.join(', '));
const latest = new Map();
for(const m of sql.matchAll(/create\s+or\s+replace\s+function\s+([a-z_]+)\.([a-z_]+)\s*\(([^)]*)\)([\s\S]*?)\bas\s+(\$[a-z_]*\$)([\s\S]*?)\5/gi)) {
  latest.set(m[1]+'.'+m[2],{header:m[4],body:m[6]});
}
for(const name of publicEndpoints.keys()) {
  let fn=latest.get('public.'+name);
  if(name==='sign_public_invoice' && fn && /security\s+invoker/i.test(fn.header)) {
    req('Invoice signature wrapper calls the private executor', /invoice_signing_private\.sign_public_invoice\(p_invoice_id,p_access_token,p_signer_name,p_signature_data_url,p_consent_version\)/i.test(fn.body.replace(/\s/g,'')), 'Unexpected signature executor');
    fn=latest.get('invoice_signing_private.sign_public_invoice');
  }
  const body=fn?.body||'';
  req(name+' has its own token format guard', /p_access_token\s*!~\s*'\^\[0-9a-fA-F\]\{64\}\$'/i.test(body), 'Missing token guard');
  req(name+' hashes the token', /digest\s*\(\s*lower\s*\(\s*p_access_token\s*\)\s*,\s*'sha256'/i.test(body), 'Missing token hash');
  req(name+' checks token revocation and expiry', /revoked_at/i.test(body)&&/expires_at/i.test(body), 'Missing token lifecycle checks');
  req(name+' fails closed on unknown tokens', /raise exception/i.test(body)&&(/if not found/i.test(body)||/if not v_ok/i.test(body)), 'Missing rejection path');
  req(name+' pins its executor search path', /set\s+search_path\s*(?:=|to)\s*/i.test(fn?.header||''), 'Missing executor search path');
}

console.log((checks-failures)+'/'+checks+' security contract assertions passed');
if(failures) process.exit(1);