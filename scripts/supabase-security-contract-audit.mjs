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

const dangerousPublicGrants = [];
for (const m of sql.matchAll(/grant\s+execute\s+on\s+function\s+public\.([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s+to\s+anon/gi)) {
  if (m[1] !== 'get_public_invoice_payment_page') dangerousPublicGrants.push(m[1]);
}
req('No unexpected anonymous privileged RPC grants', dangerousPublicGrants.length===0, 'Unexpected anon grants: '+dangerousPublicGrants.join(', '));

console.log((checks-failures)+'/'+checks+' security contract assertions passed');
if(failures) process.exit(1);