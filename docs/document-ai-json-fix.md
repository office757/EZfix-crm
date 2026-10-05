# Document AI JSON input correction — 2026-10-05

The plain user request "Make me for garage replacement" reached the active draft endpoint and received an upstream 400 invalid_request_error, surfaced to the UI as 502. A protected provider probe confirmed original input = 400 and explicit JSON instruction in input = 200. Both document drafting and social text generation now include that explicit instruction in the input, in addition to their existing server instructions.

Document draft instructions now request polished, specific scope wording and clear review requirements without invented prices, sizes, models, warranties or completed-work claims. Every returned product and rate is still validated against the live catalog. Zero-rate selections display an explicit price-review warning. No price defaults were changed.

The read-only diagnostic uses the existing server cron credential, is unavailable without it, exposes only result counts and provider status, and writes no customer, invoice or audit records. The live corrected call used the real catalog (167 entries) and produced 2 valid draft items with 6 review warnings; both selected prices were zero and marked for owner review. No customer document was created or sent.

Verification: all release gates passed; regression tests cover plain-language requests, catalog-rate authority, failed providers, secret-protected diagnostics with no writes, technician job authorization and marketing-role denial. Production draft-service-document version 4 is active. Social generation retains its previous account permissions and publishing safeguards.

The downloadable source backup includes checked-in app source/assets, Edge Functions and migrations. It does not contain current database rows, private uploaded customer files or server credentials. Restore operational data and credentials separately using the production recovery runbook.
