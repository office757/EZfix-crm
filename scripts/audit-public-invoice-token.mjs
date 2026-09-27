import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page=readFileSync(new URL('../invoice-pay.html',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20260927194045_remove_legacy_public_invoice_without_token.sql',import.meta.url),'utf8');
let n=0; const check=(name,fn)=>{fn();n++;console.log('PASS '+name)};
check('Public invoice page requires a token query parameter',()=>assert.match(page,/params\.get\('token'\)/));
check('Public invoice page validates a 64-hex token',()=>assert.match(page,/\^\[0-9a-fA-F\]\{64\}\$/));
check('RPC call sends p_access_token',()=>assert.match(page,/p_access_token:token/));
check('Legacy one-argument public invoice RPC is explicitly dropped',()=>assert.match(migration,/drop function if exists public\.get_public_invoice_payment_page\(text\)/));
console.log('Public invoice token audit: '+n+'/'+n+' PASS');