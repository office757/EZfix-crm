# EZfix CRM — Production Release Sign-off

Verified: 2026-09-23

## Release status

The original eight completion-plan tasks were released, followed by a production hardening correction to the AI service-document pricing path after a later audit found that the tracked v7/v3 workflow could derive balancing prices from a technician-supplied total.

1. Financial QA — COMPLETE
2. Payment Integrity — COMPLETE
3. Security QA — COMPLETE with documented Supabase platform warnings
4. Documents & Communications — COMPLETE
5. Ashley + Phone — COMPLETE with documented provider limitation
6. Operational QA — COMPLETE with one non-destructive duplicate-review item
7. Full E2E Production Test — COMPLETE for the released build
8. Release — COMPLETE; AI pricing hardening described below is deployed server-side and awaiting source-control merge

## Final release verification

- Production Supabase has the validated `invoices_payment_link_square_chk` constraint; any populated invoice payment link must use the Square provider, a direct `checkout.square.site` URL, exactly one `client_reference_id`, and that reference must equal the invoice number.
- Production Supabase exposes `append_invoice_payment(p_invoice_id text, p_payment jsonb, p_expected_row_version bigint)` and `convert_estimate_to_invoice(p_estimate_id text)` as invoker functions used by the atomic payment/conversion paths.
- The production Square link remains per-invoice; no global Square checkout URL is used for customer invoices.

## EZfix AI Manager / technician document workflow

The production AI document path is permission-controlled and JWT-protected.

### Post-release pricing hardening

A follow-up audit found that the previously tracked `ai-technician-assistant` v7 could use the technician-supplied requested total to create balancing labor/parts rates, proportionally scale catalog prices, or fall back to a 70/30 parts/labor allocation when catalog rates were zero. The corresponding `ai-service-document-approval` v3 recomputed totals and required active catalog IDs, but it did not independently prove that each draft rate and taxable flag matched the live Product Catalog.

That behavior has been superseded in production:

- `ai-technician-assistant` is ACTIVE at version 8. It uses active Product Catalog rates only and never balances, scales, reverse-engineers, or invents line-item rates to match a technician-supplied total.
- If the selected catalog item has a zero or missing rate, the assistant preserves the zero rate, marks pricing incomplete, and requires office/owner pricing review.
- If a positive catalog rate exists but the requested total does not match the catalog-calculated total, the catalog rate is preserved and the mismatch is flagged instead of changing the price.
- `ai-service-document-approval` is ACTIVE at version 4. Before it can queue an approval, it independently verifies that every draft line references an active catalog item, the catalog rate is positive, the draft rate matches the catalog rate, the taxable flag matches the catalog, and the requested total matches the recomputed catalog total.
- Drafts marked with incomplete pricing or a target/catalog mismatch are rejected from the approval queue until the real Product Catalog is corrected.
- The workflow remains draft-only until explicit approval; it does not directly create/send a customer financial document.

The earlier 70/30 `$750` spring example is intentionally no longer a valid production behavior. At the time of this hardening audit, 86 products were active but only 2 had non-zero rates, so broad AI-generated service-document pricing remains intentionally blocked until real catalog prices are populated.

## Financial integrity

- Card surcharge accounting keeps invoice principal separate from the 3.5% card fee.
- Full and partial card payments, deposits, mixed payment methods, legacy payments, rounding, tax, discount, overpayment, PDFs/receipts, and balance calculations were regression-checked in release QA.
- Atomic payment recording uses stable payment IDs and optimistic row-version conflict protection to prevent stale concurrent writes from overwriting one another.

## Security / provider notes retained for transparency

These items are documented platform/provider limitations rather than hidden as completed features:

- Supabase Security Advisor reports seven signed-in-user executable `SECURITY DEFINER` helper/RPC warnings. These require function-by-function review rather than blanket revocation because application/RLS flows may rely on them.
- Supabase Auth leaked-password protection remains disabled at the project setting level and should be enabled when that management setting is available.
- The connected hosted phone-agent surface does not expose a verified dynamic mid-call transfer action. When a caller asks for a human and live transfer cannot be confirmed, EZfix should preserve the callback and create/use the server-side follow-up path instead of claiming a transfer succeeded.
- Ashley V3 server guardrails prohibit asking for a payment amount merely to schedule service, inventing pricing, or presenting an unverified appointment window as confirmed. A genuine post-V3 provider call is still required to verify hosted-agent behavior end to end.

## Customer-impact safeguards

- No live customer email, SMS, WhatsApp message, or destructive customer merge was performed as part of this hardening audit.
- No charge, refund, or new Square payment link was created.
- No synthetic customer, invoice, or approval record was inserted to manufacture a successful test result.
