# EZfix CRM completion handoff — September 28, 2026

Evidence-only restart in the owner's new CRM chat. Continue this application;
do not rebuild its working catalog, invoice, estimate, or calendar workflows.

## Latest continuation — technician setup

The Smart dispatch setup now explains each missing technician requirement and
links directly to owner-managed login and contact/alert settings. Business
estimates are no longer prefilled with invented example values; blank selected
numeric fields cannot become zero. The old Team instruction about Claude artifact
sharing has been replaced with the actual owner-managed login workflow.

Production readback before this update: all three technicians have no routing
profile; Ben and Ira have no linked app login, while the test technician account
has one. Routing remains in Recommendations mode. Actual working hours, skills,
ZIP travel estimates and business costs must come from the owner before enabling
automatic offers. No technician profiles or login credentials were invented.

All 50 release steps, 14 new setup cases, and 56 database workflow/cross-channel
assertions passed. Database fixtures were rolled back. Visual browser checks for
this update were blocked by the environment's socket restriction and must not be
reported as passed. Live handset message delivery remains unverified.

## Current acceptance update — September 28, 03:20 America/New_York

The owner explicitly accepts the current synthetic transcript replay for this
EZfix CRM. Missing original Inkbox recordings are **not a completion blocker for
this application**. Keep the visible distinction between synthetic replay and
original recordings. The future larger commercial application will use other
provider plugins instead of Inkbox; do not migrate this CRM as part of that plan.

Since the initial evidence below, PRs #155–#157 repaired catalog/labor metadata,
QuickPay phone validation and saved-invoice recovery, made call audio accessible,
removed the false Save action from information dialogs, and restored invoice
logos. All 39 current release steps pass. Production verification confirmed
existing invoice INV0055's Square checkout amount ($2,836.55), original logo
loading, read-only dialog closure, calendar reload persistence, related labor
selection, and playable synthetic audio. These were desktop browser checks;
owner iPhone screenshots separately confirm invoice creation and logo display.

The latest requested presentation changes center the document payment action
and its secondary controls and remove Quick Payment from the sidebar, retaining
the mobile bottom button and the existing dashboard/More module launcher.

Issues #133–#139 were re-read and remain open. This does not prove each listed
feature is broken; it means those broad acceptance records have not been closed.
Meta/WhatsApp is the owner's stated external dependency. Final document/payment,
technician-permission/payroll, and website-lead acceptance still need current
end-to-end evidence before claiming Meta is the only remaining item.

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
