# EZfix CRM completion handoff — September 28, 2026

Evidence-only restart in the owner's new CRM chat. Continue this application;
do not rebuild its working catalog, invoice, estimate, or calendar workflows.

## Verified this session

| Area | Evidence | Status |
| --- | --- | --- |
| Source and deployment | Main `3356598` matches a READY Vercel production deployment | Verified |
| Baseline release | All 34 existing release steps passed locally | Verified; not a live UI certification |
| Supabase | EZfix project reports ACTIVE_HEALTHY | Verified |
| Transcript replay key | One fixed synthetic TTS test returned HTTP 200 and PCM bytes | Working |
| Replay storage | Production rejected WAV; Storage API repair added `audio/wav`, preserving private access and 15 MiB limit | Fixed |
| Replay preflight | v5 checks private bucket and WAV acceptance before queue claim or paid speech | Deployed; 7 handler checks pass |
| Real replay persistence | One previously failed call is ready; private object exists, 101.18 seconds, two speaker cues | Verified backend path |
| Updated release | All 36 release steps pass, including 7 catalog metadata checks | Verified |
| In-app playback | Owner signed in; 101.18-second sample loaded and playback advanced with no audio error | Verified desktop browser |
| Automatic replay | Cron 8 active; at 06:21 UTC four ready, nine pending, zero failed | Processing observed |
| Catalog metadata | Normalized database metadata now drives item type and related-labor selection | Fixed; 7 regression checks |
| Existing catalog | 84 legacy defaults repaired; 48 labor and 36 physical products; rates preserved | Production readback verified |
| Preserved catalog | 80 master records and two custom priced records compare unchanged | Verified |

Original provider recordings remain unavailable in the checked production data.
Synthetic replay must always stay explicitly separate from original recordings.

## Existing completion backlog

The following seven GitHub issues remain open. Their existence is verified;
this session does not claim a fresh end-to-end pass for every requirement.

| Issue | Area | Next evidence required |
| --- | --- | --- |
| #135 | Estimates, invoices, Quick Payment and customer pages | Signed-in owner/technician and customer-link flow, remote signature and Pay Now |
| #136 | Technician workspace, permissions and payroll | Own-only flow and commission/parts checks on current build |
| #134 | Communications, WhatsApp and phone | Replay playback; provider-specific delivery/consent readiness |
| #138 | Settings, connections, security and reliability | Current UI saves and targeted integration checks |
| #139 | Navigation, calendar, mobile and iPad | Current device/browser verification and remaining usability defects |
| #137 | AI Manager and Ashley | Current real workflow validation; catalog prices still require owner data |
| #133 | Google Ads and marketing | Real account-backed sync/metrics and website lead attribution |

The website-lead flow still needs a fresh, explicitly coordinated form submission
and verification through lead/calendar/assignment. Do not send customer messages,
place calls, make payments, or label live flows complete merely because tests pass.

## Immediate continuation

1. Verify deployed Quick Payment product selection and its related-labor popup.
2. Verify calendar navigation survives a page reload.
3. Continue the operational money/document flow and the website-lead path.
4. Keep the separate acceptance items explicit: speech fidelity, iPhone/iPad,
   long-call deadlines and the existing 15 MiB storage limit.

## Catalog repair details

`fromDbRow` flattens JSON metadata onto each product. The picker previously
looked only inside `appData`/`app_data`, losing explicit item type and labor IDs.
Both normalized and raw shapes now work. New default records carry explicit type,
related labor IDs and the existing company tax treatment; prices remain zero.

The one-time SQL under `supabase/data-fixes` changed only details, taxable and
the two metadata fields for 84 exact reviewed records. It uses the pre-existing
service maintenance role accepted by the owner-managed metadata trigger, with
transactional compare-and-swap guards. No grants, RLS or triggers changed.
The first attempts failed atomically (column mismatch, then missing maintenance
role); readback confirmed no partial writes. Final readback: 78 products, 86 labor,
two custom records, zero price changes and zero taxable labor records.
Historical invoices and estimates were not rewritten.
