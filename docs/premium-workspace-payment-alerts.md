# Premium workspace and payment alerts — October 5, 2026

More uses the existing authorized navigation groups with line icons and navy headers. Ashley groups communication, setup and business tools; Campaign Manager contains saved campaigns, social post creation and advertising connections. Business AI retains its existing financial/operations tools and owner-only permissions. Original SuperEZX artwork and customer-document branding are unchanged.

Dashboard Work Overview includes a compact monthly grid, actual selected-day jobs, assigned technician counts and unassigned work. Calendar navigation changes only this dashboard selection. The full Calendar Month/Week/Day views remain unchanged.

## Payment events and phone alerts

`queue_owner_payment_push` runs after committed invoice payment changes. Positive received payments/deposits with stable record IDs create a durable unique invoice/payment event. Pending payments, refunds, negative amounts and changes to existing received payments do not create new events. Square already verifies COMPLETED payments server-side before recording them. No historical backfill runs.

Events enqueue only active owner subscriptions. The async trigger requests the custom-secret authenticated `owner-payment-push` function immediately after commit; a one-minute cron recovers missed dispatch requests. Claims use SKIP LOCKED and are never automatically repeated after an uncertain provider response. Revoked owners, missing subscriptions and removed payments are checked before sending. Payment queues/event ledgers have RLS and no client grants; no client can invoke the claim capability. RLS-with-no-policies advisory is intentional default denial for these service-only tables.

Push lock screens contain no customer details, invoice IDs or amounts. A tap opens Payments after normal owner authentication. Browser permission and enrollment remain explicit from the notification bell. Existing lead and technician offer notifications are preserved. Apple/Google provider acceptance is not proof of phone delivery; a real phone notification has not been confirmed during this change. iPhone requires the installed Home Screen app and notification permission. Reload the current app to install the updated service worker.

The visible owner's existing invoice Realtime refresh path announces new recorded amounts after an initial history baseline, without replaying history or blocking forms. Provider push delivery does not require an open CRM tab.

## Social status

Facebook, Instagram and Google Business Profile currently report `not_connected` in the database. Campaign Manager links the working saved-campaign/social-post workspaces and existing Google Ads authorization/reporting path. It reads connector readiness server-side and never labels unconnected accounts connected. Automatic social publishing remains disabled; Meta connector setup and provider account authorization are still required. Creating a caption/draft does not publish it.

## Verification

Full release build; owner/office/technician/marketing navigation checks; calendar complete-week/date-boundary/job-selection tests; payment history/repeat/pending/refund announcement tests; push endpoint/auth/expiry/privacy/navigation tests. Live SQL integration tests ran in rolled-back transactions: manual deposit, pending-to-completed, verified Square recorder replay, amount editing, owner-only per-device recipients, repeated claim rejection and RLS/client privilege isolation. No test money transfer or phone push was sent.
