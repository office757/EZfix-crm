# Quick Payment and audio follow-up — September 28, 2026

The owner's iPhone screenshots exposed a real failure beyond the arithmetic
checks in PR #155: `Valid E.164 phone number required` after signing SMS consent,
and a secure-card button that displayed instructions without starting checkout.

## Root cause and repair

The production consent function's PostgreSQL regex over-escaped the plus sign.
Even a correctly normalized number failed. The creation function also over-escaped
its non-digit matching expression. Migration `20260928064859` changes only these
patterns, using `[+]` and `[^0-9]`. Function signatures, role checks, ACLs,
SECURITY DEFINER behavior and the empty search_path remain unchanged.

Invoice creation happened before consent saving, so each subsequent retry could
create another invoice. Six unpaid records were observed during the owner's
attempts. They remain untouched for owner review; no recorded payment was found.

Quick Payment now prevents concurrent submissions. Once an invoice ID has been
returned, a later failure clears the submitted draft, opens that saved invoice,
and explains that it already exists. A failure before an ID is returned preserves
the draft. This protects against the observed consent/refresh/checkout errors;
it is not a claim of backend idempotency after an indeterminate network response.

Consent uses the same phone normalizer as invoice creation. Changing the number
after signing requires a new signature before any invoice write. The secure-card
button uses the existing invoice/Square flow. A saved-invoice modal offers a
validated Square link that opens on a direct user tap, avoiding an asynchronous
popup call that mobile browsers can block. No card data enters the CRM.

## Call audio

Production has 15 calls: 13 synthetic transcript replays ready, none pending or
failed, and zero original recordings. The remaining two calls have no replay.
Synthetic speech must not be described as original call recordings.

Owner Communications now has a Call History & Audio shortcut. Each history row
shows its audio state. Opening a call refreshes its current record and signed
audio URL. The clearly disclosed synthetic player appears before the original
recording-unavailable notice, making the available audio easier to find.

## Verification

- Seven production SQL cases against the actual stored consent regex pass.
- Function ACL and security settings compare unchanged after migration.
- Eight actual frontend-handler tests cover normalized consent, changed phone,
  failed creation, three post-create failure points, concurrent taps and card entry.
- Four call-audio tests cover fresh URLs, player ordering, refresh failure and labels.
- All 38 release steps pass. No customer messages, payments, new production
  invoices or fabricated signatures were created for these tests.
- Security advisors still report existing role-gated/public-token APIs and
  server-only tables. This change does not certify the wider security backlog.
  See [function advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Live deployment/browser evidence is recorded on the associated pull request.
Actual iPhone checkout and owner-signed consent acceptance remain live acceptance
steps; automated mocked tests are not a claim of a completed real payment.
