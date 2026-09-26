import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20260926094835_marketing_manager_rls_hardening.sql','utf8');
let pass=0,fail=0;
const check=(name,ok)=>{if(ok){pass++;console.log('PASS '+name)}else{fail++;console.error('FAIL '+name)}};

check('old marketing metrics policy is replaced',/drop policy if exists marketing_daily_metrics_manager_select/i.test(sql));
check('new policy targets authenticated role',/for select\s+to authenticated/i.test(sql));
check('new policy is Marketing Manager scoped',/using \(public\.is_marketing_manager\(\)\)/i.test(sql));
check('metrics view becomes security invoker',/alter view public\.marketing_manager_metrics\s+set \(security_invoker = true\)/i.test(sql));
check('anonymous helper execution is revoked',/revoke execute on function public\.is_marketing_manager\(\)\s+from public, anon/i.test(sql));
check('authenticated helper execution remains explicit',/grant execute on function public\.is_marketing_manager\(\)\s+to authenticated, service_role/i.test(sql));
check('migration does not grant invoice access',!/invoices|payments|expenses|settings/i.test(sql));

console.log(`${pass}/${pass+fail} Marketing Manager RLS hardening assertions passed`);
if(fail)process.exit(1);
