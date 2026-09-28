# Lead dispatch and field workflow

Approved lead jobs use `workflow_version = 1`. Historical jobs and standalone
Quick Payment retain their existing behavior.

1. Office creates a linked source or reviews a received referral. Matching SMS,
   verified WhatsApp text, and authenticated inbound email create unassigned
   review leads. They never approve work or interpret message text as commands.
2. Office confirms the customer, service address, ZIP and appointment, then offers
   the lead to one active technician. An offer exposes ZIP only for five minutes.
3. Acceptance atomically assigns the lead and job. Existing row-level permissions
   then expose the customer details to that technician.
4. Registered exterior and before-work photos unlock work. An after-work photo
   unlocks invoicing and is copied into the linked invoice.
5. Full invoice payment, provider-confirmed receipt delivery (email or SMS), and a
   customer signature are required to close the job.

Phone notifications require the technician to enable alerts on their device.
iPhone users must first add the app to their Home Screen. WhatsApp uses the
existing Meta credentials, approved template and technician opt-in. Inbound
email requires a receiving domain and Resend `email.received` webhook setup;
only allowlisted sources passing provider authentication are ingested. These
external connections must be configured before the corresponding live channel
can work.

SMS receipts use a server-generated secure paid-invoice URL. Queued acceptance,
client delivery flags and failed messages do not unlock closure. Carrier delivery
confirmation is distinct from customer handset receipt; the existing Inkbox
handset-delivery issue still needs a live-device check.

## Verification

- `supabase/tests/lead_dispatch_rollback.sql`: 38 assertions against the actual
  database under synthetic authenticated roles, all rolled back. Storage and
  provider events are metadata fixtures; no real messages or payments are sent.
- `node scripts/audit-dispatch-sms-receipts.mjs`: 15 actual-handler scenarios with
  synthetic provider/Auth/database adapters; part of the release build.
- Isolated Chromium fixture: source creation/edit, approval/offer, ZIP-only mobile
  view, acceptance, photo gates, QuickPay prefill, receipt gate and 390px layout.
- Existing release build and QuickPay recovery checks pass. Unauthenticated
  dispatch/SMS requests and unsigned provider webhooks return 401.

Database migration files and Edge Function sources in this repository match the
deployed feature. Private executor grants permit only the validated workflow
RPCs to change protected assignment, invoice and closure fields.

## Unified lead approval and Ashley routing

Each offer now has a private SMS link and a private WhatsApp link. Opening a
link is read-only; an explicit Accept or Decline calls the same locked database
transaction used by the app. The first response wins across all three channels.
Links return only ZIP, deadline and response state. Full customer details still
require the accepting technician's signed-in account. Links stop working when
the technician account is deactivated or its login changes.

The public offer page ignores status reads started before an explicit response,
preserves decline confirmation during polling, and checks the server after a
response timeout. If the outcome cannot be read back, response controls remain
locked until reconnection confirms the state. Expired offers expose the app
link immediately. Notification links open Leads on the first authorized render,
and returning to the app refreshes cross-channel responses without waiting for
the next polling interval.

`ashley-routing.js` adds Smart dispatch inside Ashley, with entry points in Team
and Leads. The owner configures skills and expected closing rate, sale, parts,
duration, commission, extra hourly cost, working hours and ZIP travel estimates.
Scoring combines those baselines with the last 90 days of completed/cancelled
job outcomes and pre-tax invoice amounts. Weekly balance contributes only
within the configured business-score tolerance and is capped at 20% of total
weight. Travel estimates are configured by the owner; this is not live GPS or
traffic routing. Contribution estimates are planning data, never customer quotes.

The initial mode is **Recommendations** with no fabricated technician profiles.
Automatic mode requires an enabled profile and an active technician login. The
worker offers only new, complete Ashley leads from the enable date, excludes
unavailable technicians, retains the customer's original service window for
rerouting, and stops at the attempt limit. AI Manager's pause applies both at
routing time and when an automatic offer is accepted. Changes to the technician's
schedule, profile or the routing policy invalidate an outstanding reservation
before assignment. Historical and incomplete intakes stay with the office.

Per-channel delivery state remains visible. Provider acceptance is not handset
delivery. WhatsApp requires its existing Meta template/connection and the
technician's WhatsApp number and opt-in; SMS respects an existing opt-out.

Additional verification:
- `audit-ashley-dispatch.mjs`: 23 ranking/capacity/cost/time-window scenarios.
- `audit-lead-offer-channels.mjs`: 13 actual-handler scenarios with isolated
  provider/DB adapters, including read-only previews and duplicate send claims.
- `audit-lead-offer-ui.mjs`: 14 UI scenarios covering out-of-order reads, network
  interruption, server-clock expiry, cross-channel responses and app entry.
- `lead_offer_channels_rollback.sql`: 18 cross-channel and permission assertions.
- `dispatch_revalidation_rollback.sql`: 9 automatic-reservation assertions,
  including successful acceptance and cancellation after schedule/owner changes.
- Isolated mobile/desktop browser: profile saving, commission, lead preview,
  ZIP-only technician view, public response, reload and 390px layout.
