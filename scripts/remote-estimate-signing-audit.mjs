import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260926093050_remote_estimate_signing.sql','utf8');
let pass=0, fail=0;
const check=(name,ok,detail='')=>{
  if(ok){pass++;console.log('PASS '+name);}
  else{fail++;console.error('FAIL '+name+(detail?': '+detail:''));}
};

check('signing token table has RLS', /alter\s+table\s+public\.public_estimate_signing_tokens\s+enable\s+row\s+level\s+security/i.test(sql));
check('direct client table access is revoked', /revoke\s+all\s+on\s+table\s+public\.public_estimate_signing_tokens\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql));
check('tokens are generated with 32 random bytes', /gen_random_bytes\s*\(\s*32\s*\)/i.test(sql));
check('only token hash is stored', /token_hash/i.test(sql) && /digest\s*\(\s*lower\s*\(\s*v_token\s*\)\s*,\s*'sha256'/i.test(sql));
check('public token validates 64 hex characters', /\^\[0-9a-fA-F\]\{64\}\$/i.test(sql));
check('signing link checks expiry', /expires_at\s*>\s*now\(\)/i.test(sql) && /v_token\.expires_at\s*<=\s*now\(\)/i.test(sql));
check('signing link checks revocation', /revoked_at\s+is\s+null/i.test(sql) && /v_token\.revoked_at\s+is\s+not\s+null/i.test(sql));
check('signing link checks one-time use', /used_at\s+is\s+null/i.test(sql) && /v_token\.used_at\s+is\s+not\s+null/i.test(sql));
check('stale row version is rejected', /row_version\s*<>\s*v_token\.issued_row_version/i.test(sql));
check('stale snapshot hash is rejected', /v_current_hash\s*<>\s*v_token\.estimate_snapshot_hash/i.test(sql));
check('technician issuance is job scoped', /j\.technician_id\s*=\s*v_team/i.test(sql) && /j\.estimate_id\s*=\s*v_est\.id/i.test(sql));
check('signature image type is constrained', /data:image\/\(png\|jpeg\|webp\);base64/i.test(sql));
check('signature payload has size cap', /octet_length\s*\(\s*p_signature_data_url\s*\)\s*>\s*750000/i.test(sql));
check('remote signature records snapshot hash', /'snapshotHash'\s*,\s*v_token\.estimate_snapshot_hash/i.test(sql));
check('commercial edit invalidates signature', /invalidate_estimate_signature_on_commercial_change/i.test(sql) && /new\.signature\s*:=\s*null/i.test(sql));
check('commercial edit revokes unused tokens', /set\s+revoked_at\s*=\s*coalesce\s*\(\s*revoked_at\s*,\s*now\(\)\s*\)/i.test(sql));
check('raw token is not written to audit log', !/audit_log[\s\S]{0,1000}v_token/i.test(sql));
check('public read RPC is explicit anon grant', /grant\s+execute\s+on\s+function\s+public\.get_public_estimate_signing_page\(text,text\)\s+to\s+anon/i.test(sql));
check('public sign RPC is explicit anon grant', /grant\s+execute\s+on\s+function\s+public\.sign_public_estimate\(text,text,text,text,text\)\s+to\s+anon/i.test(sql));
check('issuance RPC is not anonymous', /revoke\s+all\s+on\s+function\s+public\.issue_public_estimate_signing_token\(text\)\s+from\s+public\s*,\s*anon/i.test(sql));

console.log(`${pass}/${pass+fail} remote estimate signing assertions passed`);
if(fail) process.exit(1);
