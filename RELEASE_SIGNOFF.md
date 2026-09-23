# EZfix CRM — Production Release Sign-off

Verified: 2026-09-23

## Release status

All eight completion-plan tasks are complete:

1. Financial QA — COMPLETE
2. Payment Integrity — COMPLETE
3. Security QA — COMPLETE with documented Supabase platform warnings
4. Documents & Communications — COMPLETE
5. Ashley + Phone — COMPLETE with documented provider limitation
6. Operational QA — COMPLETE with one non-destructive duplicate-review item
7. Full E2E Production Test — COMPLETE
8. Release — COMPLETE

## Final release verification

- GitHub `main` was fast-forwarded to commit `819f0da09094fbd60d825811707c02550db7ce30` so the repository includes the Square invoice payment-link integrity migration already applied in production.
- Production Supabase has the validated `invoices_payment_link_square_chk` constraint; a live integrity query found zero populated invoice payment links violating the Square provider / `checkout.square.site` / invoice-number `client_reference_id` rule.
- Production Supabase exposes `append_invoice_payment(p_invoice_id text, p_payment jsonb, p_expected_row_version bigint)` and `convert_estimate_to_invoice(p_estimate_id text)` as invoker functions used by the atomic payment/conversion paths.
- Vercel created the production deployment for main commit `819f0da09094fbd60d825811707c02550db7ce30`; deployment state was verified READY and production returned successfully through the authenticated Vercel fetch.
- Vercel reported no production runtime-error clusters in the final one-hour verification window.

## EZfix AI Manager / technician document workflow

The production AI document path is permission-controlled and JWT-protected.

- `ai-technician-assistant` is ACTIVE, version 7, and now matches the tracked release source.
- `ai-service-document-approval` is ACTIVE, version 3, and now matches the tracked release source.
- The technician assistant supports Hebrew requests and interprets a technician-provided tax-inclusive customer total.
- For active catalog lines that intentionally have zero editable rates, the assistant creates an editable parts/labor draft rather than persisting a financial document directly.
- The current fallback draft allocation is 70% parts / 30% labor before tax when both selected catalog rates are zero. Parts follow the catalog taxable flag and labor follows its catalog taxable flag.
- With Massachusetts 6.25% tax, the requested example `תעשה לי קבלה על קפיצים כולל מיסים ב750` reconciles to $502.99 taxable spring parts + $215.57 non-taxable labor + $31.44 tax = $750.00.
- If the spring type is not specified, the assistant flags torsion-vs-extension and quantity for review instead of pretending it knows the missing job detail.
- Technician drafts remain draft-only and require approval; technician customer context requires an assigned job. The approval endpoint re-computes totals server-side, requires active catalog item IDs, verifies job scope, and queues a pending approval rather than directly creating/sending the financial document.

## Financial integrity

- Card surcharge accounting keeps invoice principal separate from the 3.5% card fee.
- Full and partial card payments, deposits, mixed payment methods, legacy payments, rounding, tax, discount, overpayment, PDFs/receipts, and balance calculations were regression-checked in the release QA.
- Atomic payment recording uses stable payment IDs and optimistic row-version conflict protection to prevent stale concurrent writes from overwriting one another.

## Security / provider notes retained for transparency

These items are documented non-blocking platform/provider limitations rather than hidden as completed features:

- Supabase Security Advisor still reports seven intentionally exposed `SECURITY DEFINER` helper/RPC warnings. The release QA verified their fixed search paths and authorization behavior where consequential writes are possible.
- Supabase Auth leaked-password protection remains disabled at the project setting level and should be enabled when that management setting is available.
- The connected hosted phone-agent surface does not expose a verified dynamic mid-call transfer action. When a caller asks for a human and live transfer cannot be confirmed, EZfix creates an idempotent high-priority callback task instead of falsely claiming a transfer succeeded.

## Customer-impact safeguards

- No live customer email, SMS, WhatsApp message, or destructive customer merge was performed as part of final QA.
- E2E financial/data tests used rolled-back isolated production transactions where applicable, leaving no QA customer/job/invoice residue.
