# EZfix overnight closeout — 2026-10-05

## Authorization and appearance

David approved functional closeout and an overnight follow-up. His latest instruction locks **all appearance**, including the Visualizer. Do not change CSS, layout, logos, static markup, colors, typography, or any screen design. Approved baseline: `58c045ba405dd4edb8978babb6f8783e53c4ea46` (PR 272). `scripts/test-approved-appearance.mjs` checks 26 appearance assets and the static HTML shell. Follow the newest AGENTS.md instruction over older visual exceptions.

One-shot follow-up scheduled for approximately 03:00 America/New_York on October 5. Read this document and current AGENTS.md first; inspect current main and production before changes. Do not repeat completed checks without a new failure, change, or unresolved concern.

## Completed in this closeout

- Fixed CRM business date: America/New_York instead of UTC; rolling dates handle daylight saving and year boundaries.
- Stop expense saving and modal closure when its selected receipt photo fails to upload.
- Refresh the default 30-day job profitability range when a tab crosses business midnight; preserve manually selected ranges.
- Added four regression tests and an appearance integrity check to the release build.
- Full release build passed; all six business-tools browser fixture workflows passed; 37 Edge security checks passed. Fixtures use synthetic records and mocked providers, not live customer payments or messages.
- Read-only live checks around 05:41 UTC: SMS sent/received/delivered events and processed Square webhooks present; finance diagnostic reports configured Square, one verified bank, no diagnostic errors, and available AI models.
- No orphaned job/customer/invoice references or duplicate Square payment IDs found. All public tables have RLS. The 23 RLS-without-policy advisor findings are intentionally service-only tables with no SELECT grants to anon/authenticated; do not add blanket policies.
- Source/assets backup from PR 272 was made available separately. It is not a database or storage-object backup.

## Follow-up tasks, in order

1. Check production deployment matches main and inspect fresh functional errors. Reproduce any failure before changing code, add meaningful regression coverage, and run the appearance check. Publish only authorized functional fixes.
2. Investigate `sync-inkbox-calls` errors read-only. In the sampled hour, 14 ERROR entries were attributed to this function; detail log retrieval failed, so an actual sync failure is **not established**. Calls exist (18 in the past 30 days, 17 with transcripts), while recording URLs/assets are absent. Determine whether the provider offers recordings before promising their availability.
3. **Deployment drift warning:** live `sync-inkbox-calls` v22 has a different receptionist guardrail prompt from the repository file. The remainder compared equal. Do not redeploy the stale repository function or silently overwrite live receptionist instructions. Reconcile current instructions and source before any necessary deployment. A retrieved copy was retained as a temporary diagnostic file; never treat it as approval for behavior changes.
4. Review WhatsApp failures/pending/configuration statuses and social channel prerequisites. There are no social OAuth connections; website inbound is connected. Recent WhatsApp counts include failed, pending, not_configured, and blocked_no_opt_in entries; distinguish demo/history from current customer traffic before assigning causes. Do not send test messages to customers or bypass opt-in.
5. Verify recovery prerequisites using available read-only account capabilities: database backup retention/PITR and storage-object coverage. Current tools have not established these, and no restore test was run. Never restore production during QA. Leaked-password protection remains an account-setting advisor warning; do not claim it was enabled or change credentials.
6. Catalog pricing: 167 active products, 165 unpriced. Obtain owner prices when available; never invent financial amounts. AI draft formatting was fixed earlier; real catalog prices remain an input dependency.
7. Real technician-device handoff, microphone/provider behavior, and the complete live customer workflow remain unverified. Validate safely with authorized test identities and fixtures; no real charges, calls, messages, or financial documents without explicit instruction.
8. Visualizer stays last. Inspect and fix reproduced functional failures only. All appearance remains frozen.

## Reporting and boundaries

Report completed fixes, verification scope, and specific unresolved dependencies in concise Hebrew. Never label account/provider blockers as completed. No customer messages, calls, charges, credential changes, production restores, or unattended changes to live receptionist instructions. No subagents unless explicitly authorized by applicable instructions. Keep backups free of secrets and describe their scope accurately.

## Follow-up findings — October 5, 2026, around 08:00 UTC

- Main and READY production deployment both matched `b9a227a503a209f7e0c5ed7c3cf9a33c27e46251` before this change. Supabase project reports ACTIVE_HEALTHY.
- The 25 error-level logs sampled from 05:50–07:55 UTC all contain the same Deno synchronous-file-read performance warning. They are not failed calls or guardrail-update errors. In the retained three-hour HTTP responses, all 505 responses were HTTP 200; all 36 call-sync responses reported 18 synced calls and zero failures. No cron job failures in that period.
- Reproduced a separate transcript data-loss defect in synthetic handler tests: a rejected transcript request overwrote an existing conversation and summary with empty values. Empty/malformed responses were also unsafe. Fixed updates to omit transcript/summary unless usable provider text is available; a new call can still be saved and reconciled later. Five regression tests cover provider failure, empty/malformed data, successful refresh, new-call recovery, and unauthorized requests. The two data-preservation tests failed before the fix and passed afterward. No production transcript loss is asserted from these tests.
- Reconciled the repository receptionist guardrail block **verbatim** to retrieved live v22 before modifying sync behavior. The current live intake-only rules match David's October 1 instruction. No new voice behavior was introduced, and tests confirm an already matching provider configuration is not written.
- Recording metadata inspection found no recording/audio/media URL in the stored provider call payloads. Recording availability remains a provider dependency; no invented URL or permissive download host was added.
- WhatsApp statuses are two different transports: the linked-device path has two sent records with provider IDs (October 1 and 3) and five uncertain historical outcomes from September 29, including one explicitly flagged demo. Do not retry unknown outcomes automatically. Meta Cloud API has 16 not_configured records, six untouched pending records from September 28–29, and one missing-opt-in record. A successful linked-device send does not establish Meta Cloud readiness.
- Social channel OAuth connections remain zero. Website inbound remains connected; Google Business Profile, Google Ads, Facebook and Instagram remain disconnected in CRM.
- Storage inventory has 67 objects, approximately 173 MB, in crm-assets. This is inventory only, **not backup evidence**. Current account tools do not expose the project's actual backup list, retention, PITR status or password-protection configuration. Verify those in Supabase Dashboard; no restore attempted. Official backup guidance: https://supabase.com/docs/guides/platform/backups .

Publication gate for this fix: release checks and appearance check pass, main/production aligned, deployed sync source matches tested source, and the next naturally scheduled call reconciliation succeeds without loss of stored transcript coverage. Do not invoke customer messaging, payment, or call workflows to verify.
