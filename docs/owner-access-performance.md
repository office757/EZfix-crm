# Current EZfix workspace: owner corrections and smoother refreshes

SuperEZX development continues on the working EZfix application. Customer documents,
payment integrations, receipt archive and the original SuperEZX sidebar asset remain
unchanged. This release does not migrate businesses or establish multi-tenant isolation.

Active owner membership enables job status corrections, reopening and direct technician
reassignment after arrival, estimates without a technician, and invoices without photos.
The owner can close a job without photos, receipt delivery or customer signature; the
existing Complete & Sign action still captures a real signature when requested.
Closing does not alter invoice balances, provider events, receipt-delivery facts or
payment records. Customer/invoice corrections retain the existing owner permissions and
before/after database audit trail. Workflow versions and provider facts remain server-managed.
Technician view-as mode retains technician requirements. Office/staff gates and RLS remain.

Owner assignment changes cancel stale pending offers and update linked leads atomically.
The added internal trigger is not client executable. The public signed-completion wrapper
runs as invoker and routes non-owners through the original workflow executor.

Signed asset URLs are cached only in memory for 50 minutes (one-hour server URLs), with
concurrent request deduplication and a maximum of six signing requests. Login identity
changes and sign-out clear the cache; outstanding results from old sessions are ignored.
Failed requests retain the previous image and retry on a later refresh. Realtime changes
coalesce for 180 ms, refresh each affected collection once, and render once. Events during
an active refresh trigger another fresh read, avoiding dropped updates.

Validation: complete build-release gates pass. The asset regression uses 80 references to
12 assets: 12 initial signing requests and zero on an immediate repeat; this is a synthetic
request-count result, not a production timing benchmark. Expiry, session changes, retries,
concurrency and trailing realtime events are exercised. supabase/tests/owner_workflow_overrides.sql
checks actual authenticated owner/technician/office behavior, optional signed closure,
audit events, unchanged invoices and linked-lead/offer synchronization, then rolls back.
No browser visual or live latency benchmark was available in this session.
