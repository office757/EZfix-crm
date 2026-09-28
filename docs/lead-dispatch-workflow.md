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
