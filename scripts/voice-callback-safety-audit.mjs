import fs from "node:fs";
import assert from "node:assert/strict";

const fn=fs.readFileSync(new URL("../supabase/functions/place-inkbox-callback/index.ts",import.meta.url),"utf8");
const sql=fs.readFileSync(new URL("../supabase/migrations/20260925054634_voice_callback_authorization.sql",import.meta.url),"utf8");
let n=0; const ok=(c,m)=>{assert.ok(c,m);n++;console.log("PASS "+m)};

ok(fn.includes('toLowerCase() !== "owner"'),'callback backend is owner-only');
ok(fn.includes('entity_type and entity_id are required'),'callback requires CRM entity context');
ok(fn.includes('getEntity(db, entityType, entityId)'),'destination is resolved from CRM entity');
ok(fn.includes('phone = normalizeE164(entity.phone)'),'destination phone comes from CRM entity');
ok(fn.includes('CONSENT_ATTESTATION'),'authorization stores fixed consent attestation');
ok(fn.includes('customer_request')&&fn.includes('recorded_call')&&fn.includes('signed_form'),'only evidence-backed consent sources are allowed');
ok(fn.includes('evidence_reference'),'authorization requires evidence reference');
ok(fn.includes('A current unused voice callback authorization is required'),'live dial requires active single-use authorization');
ok(fn.includes('confirm_call !== true')&&fn.includes('"CALL NOW"'),'live dial requires two-part explicit confirmation');
ok(fn.includes('hour >= 9 && hour < 19'),'live dial is time-window gated');
ok(fn.includes('provider.dedicated_number'),'live dial requires dedicated Inkbox number');
ok(fn.includes('CallMode.HOSTED_AGENT'),'call uses Inkbox hosted Voice AI');
ok(fn.includes('CallOrigin.DEDICATED_NUMBER'),'call uses dedicated Inkbox line');
ok(fn.includes('OnVoicemail.HANG_UP'),'AI callback does not leave autonomous voicemail');
ok(fn.includes('used_at: usedAt')&&fn.includes('attempt_status: "submitting"'),'authorization is consumed before provider submission');
ok(fn.includes('retry_safe: false'),'uncertain provider outcome is not retry-safe');
ok(!/for\s*\([^)]*(customers|leads)/.test(fn),'backend has no customer/lead bulk-dial loop');
ok(sql.includes('enable row level security'),'authorization table has RLS');
ok(sql.includes('revoke all on table public.voice_callback_authorizations from public, anon, authenticated'),'authorization table is not client-accessible');
ok(sql.includes("where revoked_at is null and used_at is null"),'database enforces one active unused authorization');
ok(sql.includes("interval '30 days'"),'authorization lifetime is capped at 30 days');
console.log(n+"/"+n+" voice callback safety assertions passed");
