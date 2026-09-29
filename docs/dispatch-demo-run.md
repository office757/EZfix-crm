# Scoped Ashley demo acceptance

The September 29 owner-authorized exercise uses seven existing Demo leads and
10 existing same-batch demo technicians. The real automatic route still only
loads new AI Receptionist leads. Demo leads retain their source and timestamps.

`dispatch_demo_runs` is a service-only allowlist. It is disabled by default,
expires within one hour, and pins exact lead IDs, technician IDs and the
owner-confirmed WhatsApp recipient. No run or cron is seeded by the migration.
The regular worker credentials or a signed-in owner may request `run_demo` with
a batch ID, but cannot supply alternate lead IDs or recipients in that request.

One step runs at a time, using the production ranker and reservation RPC. An
existing pending, expired or declined offer stops progression; there is no
resend or automatic reassignment. Accepted offers allow the next step. A held
result is recorded and the next invocation proceeds. Both the worker and the
reservation transaction enforce demo isolation. The transaction still checks
policy/pause, versions, technician access, positive business eligibility,
capacity, pending reservations and the requested window.

Notifications use the existing deduplicated linked WhatsApp queue and are labeled
DEMO plus the technician number. The demo path suppresses SMS and web push.
Customer acceptance links remain the existing token-bound explicit-POST flow;
opening a preview never accepts an offer. Do not auto-accept to make a test pass.

Before activation, seed the existing scenario-4 capacity fixture: one explicitly
marked scheduled demo job for DEMO 08 on September 30, 07:00–08:00. Without that
fixture, the closer technician is actually free and the capacity scenario does
not test its stated condition. Do not add fake completed jobs or revenue.

Validation: seven ranking scenarios and same-batch isolation pass; 26 routing
checks and 23 notification checks pass. Scoped worker checks cover expiry,
recipient/record mismatch, pause, pending/expired/declined replay, successful
commit-before-notify and rejected commits. Rolled-back live-schema checks verify
service-only table privileges, disabled/expired/mismatched-recipient rejection,
one valid demo reservation and duplicate rejection. No notifications are invoked
by the database rollback tests.

Live evidence must be recorded separately: queued is not delivered, and delivery
is not technician acceptance. Windows host uptime and active pairing remain
necessary for the linked-device transport.
