# EZfix CRM Overnight Status — 2026-09-26

## Executive status
Production was intentionally left unchanged. No branch was merged, no production migration was applied, no unrelated credentials were rotated, and no data was deleted.

The two active workstreams are:
- PR #73 — Marketing Manager workspace + AI technician parser hardening
- Draft PR #74 — Remote Estimate Signing

Both branches are ahead of `main`, their latest Vercel previews are READY, and Vercel reported no runtime errors in the latest one-hour check.

## Completed overnight work

### AI Technician Assistant
- Fixed natural-language total parsing so phrases such as `for 2100` are recognized.
- Prevented garage-door dimensions such as `16/7` and `9/7` from being interpreted as dollar totals.
- Corrected garage-door catalog mapping to `garage_doors`.
- Preserved the catalog-only pricing rule: unresolved or zero catalog pricing is not silently invented or balanced.
- Added parser regression coverage.
- Result: **12/12 PASS**.

### Marketing Manager
- Dedicated restricted workspace is prepared in PR #73.
- Browser boot/data loading is role-aware and Marketing Manager loads only Customers + Leads.
- Sidebar/routes hide restricted CRM areas.
- Live RLS inspection confirms invoices, expenses, and settings remain outside Marketing Manager access.
- Prepared migration `20260926094835_marketing_manager_rls_hardening.sql`:
  - replaces the intentionally-blocked Marketing Manager metrics source policy with authenticated Marketing-Manager-only SELECT;
  - changes `marketing_manager_metrics` to `security_invoker=true`;
  - removes anonymous EXECUTE on `is_marketing_manager()`;
  - retains explicit authenticated/service-role helper execution.
- Migration compiled against the live schema inside `BEGIN/ROLLBACK`; no persistent DB change.
- Marketing Manager RLS audit: **7/7 PASS**.

### Remote Estimate Signing
- Architecture documented and implementation prepared in Draft PR #74.
- Prepared token table with RLS and no direct client access.
- Access tokens are 32 random bytes, stored only as SHA-256 hashes, with expiry, revocation, row-version and snapshot binding.
- Public read/sign RPCs validate the token and reject stale estimates.
- Remote signature records signer, timestamp, source, consent version, issued row version and snapshot hash.
- Commercial estimate edits automatically invalidate the existing signature and revoke unused signing links.
- Added a branded, mobile-first `estimate-sign.html` review/sign page.
- Added protected `send-estimate-signing-email` backend that derives the recipient from CRM data rather than accepting an arbitrary recipient.
- Added CRM client integration module for the future Estimate action.
- Migration repeatedly compiled against the live schema inside `BEGIN/ROLLBACK`; no persistent DB change.
- During transactional QA an actual bug was caught before deployment: the signing audit event used an invalid `audit_log.source` value. It was corrected to an allowed source and the migration was revalidated.
- Remote signing security audit: **20/20 PASS**.
- Remote signing UX/integration audit: **20/20 PASS**.

## QA results
- CRM Safety: **22/22 PASS**
- Receptionist Dashboard Truth: **16/16 PASS**
- Accessibility / Mobile: **23/23 PASS**
- Supabase Security Contract: **18/18 PASS**
- AI Service Approval Executor: **13/13 PASS**
- Technician AI Job UI: **8/8 PASS**
- Integration Health: **16/16 PASS**
- Final Live Edge Security: **37/37 PASS**
- Public Endpoint Hardening: **17/17 PASS**
- Job Completion Signature: **13/13 PASS**
- Job Number Integrity: **14/14 PASS**
- Recovery Readiness: **15/15 PASS**
- Production Health: **25/25 PASS**
- AI Receptionist Guardrails: **11/11 PASS**
- Ashley / 10DLC static audit: **8/8 PASS**
- AI Technician Parser Regression: **12/12 PASS**
- Marketing Manager RLS Hardening: **7/7 PASS**
- Remote Estimate Signing Security: **20/20 PASS**
- Remote Signing UX / Integration: **20/20 PASS**

## Ashley / Inkbox overnight health
Latest 12-hour live call check:
- Calls: **2**
- Linked to Lead: **2**
- Unlinked calls: **0**
- Lead extraction failures: **0**
- Call status failures: **0**

The Inkbox call reconciliation and call-to-lead processing cron jobs remain active and the latest one-hour run sample was continuously **succeeded** at the expected five-minute cadence.

The `inkbox_events` table had no new events in the latest 12-hour window; this is not itself an error because the active call reconciliation path is tracked separately in `calls` and cron execution.

## Current blockers / items intentionally not activated

### Requires explicit production approval
1. Merge PR #73.
2. Apply the Marketing Manager RLS hardening migration.
3. Merge Draft PR #74 when the end-to-end signing path is ready.
4. Apply the Remote Estimate Signing migration.
5. Deploy `send-estimate-signing-email` to Supabase.
6. Configure `CRM_PUBLIC_BASE_URL`.
7. Wire the prepared `estimate-signing-client.js` action into the large single-file CRM `index.html`.
8. Perform a real disposable-estimate end-to-end signing test after the backend exists in a test/approved target.

### Pricing decision still required
The AI Technician Assistant intentionally refuses to invent prices. Several garage-door / hardware / labor catalog entries are still zero-priced. Requests such as “make an invoice for $2,100 including labor” can be parsed correctly now, but they should continue to require Pricing Review until approved catalog pricing or an explicit owner-approved allocation rule exists.

## Items requiring David at the computer
No urgent intervention is required for overnight health.

When ready to move toward release, David should review/approve:
- whether PR #73 should be merged and its RLS migration applied;
- the desired production base URL for public Estimate signing;
- whether Remote Signing should be activated in production;
- the intended pricing policy for zero-priced catalog products.

## Safety / change-control confirmation
- No production merge performed.
- No production migration applied.
- No production Edge Function deployed.
- No credentials rotated.
- No destructive data operation performed.
- All database migration validation used `BEGIN/ROLLBACK`.
