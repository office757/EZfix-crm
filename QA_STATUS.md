# EZfix CRM completion QA status

Last verified: 2026-09-23
Production branch: `main`
Post-release pricing hardening branch: `chatgpt/catalog-pricing-guardrail-2026-09-23`

## 8-task release plan

1. Financial QA — **COMPLETE**
2. Payment Integrity — **COMPLETE**
3. Security QA — **COMPLETE (with documented platform warnings)**
4. Documents & Communications — **COMPLETE**
5. Ashley + Phone — **COMPLETE with provider limitation; post-V3 live-call verification still pending**
6. Operational QA — **COMPLETE (with one duplicate-review item)**
7. Full E2E Production Test — **COMPLETE for the released build**
8. Release — **COMPLETE**

A later production audit found and corrected one important AI pricing issue: the released technician document workflow could derive balancing line-item prices from a technician-supplied target total when catalog rates were zero. That behavior is no longer allowed in production. The active server-side workflow now uses Product Catalog rates only and blocks approval when pricing is missing or does not reconcile.

## Task 1 — Financial QA

Verified the payment/accounting model after the card-surcharge fix:

- Massachusetts 6.25% sales-tax calculations.
- Discount-before-tax behavior.
- Mixed taxable / non-taxable line items.
- Legacy payments containing only `amount`.
- New card payments split into `appliedAmount`, `cardFee`, and `chargedAmount`.
- Full card payment: $1,000 invoice balance -> $1,035 charged at 3.5% -> $1,000 applied + $35 card fee -> $0 invoice balance.
- Partial card payment: $517.50 charged -> $500 applied + $17.50 card fee -> $500 remaining on a $1,000 invoice.
- Card deposit behavior.
- Mixed card + cash payments.
- Legacy + new-format payment combinations.
- Real overpayment still triggers overpayment handling.
- Card surcharge inverse-rounding is reconciled to the authoritative invoice balance for a full-balance payment.
- Invoice-facing payment totals, receipts, PDFs, timelines, and financial displays use the invoice-applied amount rather than treating the surcharge as principal.

## Task 2 — Payment Integrity

Production database and frontend use the atomic `append_invoice_payment` RPC.

Verified in rolled-back production transactions:

- A new payment increments the invoice payment array exactly once.
- Replaying the same payment ID is idempotent even when the caller presents the original stale row version.
- Two different payments attempting to use the same stale row version do not overwrite one another: the second attempt is rejected with SQLSTATE `40001` and the first payment remains the only appended record.
- Payment records carry stable IDs.
- The RPC requires a positive applied amount, a payment ID, an expected row version, and a live non-deleted invoice.
- Frontend payment recording re-reads the authoritative invoice before invoking the RPC and refreshes the in-memory invoice from the returned database row.

Production migration for atomic payment recording is applied.

## Task 3 — Security QA

Verified directly against production Supabase using role simulations where appropriate:

- RLS is enabled and FORCE RLS is active on critical business tables including customers, leads, jobs, estimates, invoices, team, settings, products, inventory adjustments, and audit log.
- Technician role cannot see invoices, estimates, settings, or leads.
- Technician role can see its assigned jobs and the product catalog required for field work.
- Technician can update allowed operational job fields.
- Technician is blocked by the database trigger from changing protected job fields such as pricing/cost/assignment/payment method.
- Technician is rejected by sensitive stock-adjustment and invoice-number RPC paths.
- Owner role can access the required CRM datasets.
- Role helper functions no longer fall back to Owner when no authenticated team member is present.
- Sensitive SECURITY DEFINER functions use fixed search paths and perform explicit authorization checks where consequential writes are possible.

### Supabase Security Advisor status

The advisor currently reports:

- Seven warnings for signed-in-user executable `SECURITY DEFINER` helper/RPC functions. These require function-by-function review rather than blanket revocation because application/RLS flows may rely on them.
- Supabase Auth leaked-password protection is disabled. This is an external Auth project setting rather than an application/database-policy defect; enable it in Supabase Auth settings when management access for that setting is available.

## Task 4 — Documents & Communications

Verified the document and outbound-communication paths without sending unintended customer messages:

- Estimate/Invoice totals use the same discount/tax calculation model as the financial layer.
- PDF/receipt/deposit rendering uses invoice-applied payment amounts, so card surcharge is not shown as invoice principal.
- Direct Square Pay Now links are validated as HTTPS `checkout.square.site` links tied to the exact invoice number through `client_reference_id`.
- The database constraint `invoices_payment_link_square_chk` prevents a populated invoice payment link from using the wrong provider/domain/reference.
- Card fee disclosure is shown separately from the invoice balance when Pay Now is available.
- Production `invoice-email-preview` v8 prefers `appliedAmount` and falls back to legacy `amount`, validates the per-invoice Square link, and displays PAY NOW only when the link is verified and a positive balance remains.
- `send-crm-email` requires authenticated active staff; non-owner sends require a fresh matching communication approval, approvals are claimed atomically, and recipient/body/attachment hashes are verified.
- `send-inkbox-sms` requires authenticated authorized staff, enforces consent/STOP rules, validates message size/recipient, and handles provider rejection versus unknown provider outcome without pretending success.
- Provider failures are surfaced rather than silently reporting success, and accepted communication attempts are logged/audited.

No live customer email/SMS/WhatsApp was sent during these QA passes.

## Task 5 — Ashley + Phone

Verified the production Ashley / phone / technician-assistant stack:

- `sync-inkbox-calls`, `process-inkbox-call-leads`, and `inkbox-webhook` are active and preserve call/transcript history in production.
- Ashley hosted-agent V3 guardrails are managed server-side: collect caller details, do not ask for a payment amount merely to schedule service, never invent pricing, treat requested appointment windows as preferences until confirmed, and never claim booking/assignment/payment/transfer success without provider confirmation.
- The known pre-V3 call in which Ashley repeatedly asked for a payment amount during scheduling is preserved as `guardrail_review` and is not presented as a successful interaction.
- Provider refresh paths preserve CRM-owned call outcomes instead of overwriting them with provider outcome data.
- Call processing links known callers to customers, creates or links leads when appropriate, records missing caller fields, and flags guardrail violations for review.
- Technician assignment is permission-controlled and is currently disabled for Ashley; a caller preference is not treated as an assignment.
- The human-transfer target is `+1 774-244-5533`. The current hosted-agent provider surface does not expose a verified dynamic mid-call transfer action, so the system does not pretend a transfer occurred. When a human is requested and provider forwarding is not confirmed, the server-side follow-up path creates an idempotent high-priority callback task.
- A genuine post-V3 provider call is still required before hosted-agent behavior can be called end-to-end live verified.

### Technician AI pricing correction

The original release QA documented a tax-inclusive `$750` technician request by deriving a parts/labor allocation when catalog prices were zero. That behavior was later found to be unsafe because it allowed the AI to manufacture line-item rates from a target total.

Production has been hardened:

- `ai-technician-assistant` is ACTIVE at v8 and uses active Product Catalog rates only.
- It does not create balancing labor, proportionally scale catalog rates, reverse-engineer prices, or use a 70/30 fallback.
- If a selected catalog item has a zero or missing rate, the draft keeps that rate and marks pricing incomplete instead of inventing a price.
- If the technician-supplied target total differs from catalog-calculated pricing, the catalog pricing is preserved and the mismatch is flagged.
- `ai-service-document-approval` is ACTIVE at v4 and independently verifies active catalog item IDs, positive catalog rates, exact draft/catalog rate equality, taxable-flag equality, and target/catalog total reconciliation before an approval can be queued.
- Drafts with incomplete pricing or catalog/target mismatches are blocked from the approval queue.
- The workflow remains draft-only until explicit approval and does not directly create/send a customer financial document.

At the latest live audit, 86 catalog products were active and only 2 had non-zero rates; 84 therefore remain intentionally blocked from automatic AI pricing until real catalog prices are populated.

## Task 6 — Operational QA

Verified production operational integrity and deployment health:

- Customers, Leads, Jobs, Estimates, and Invoices had no orphaned customer/job conversion references in the audited live dataset.
- The audited live dataset contained 3 customers, 7 leads, 2 jobs, 1 estimate, and 6 invoices; referential-integrity checks returned zero orphaned job customers, estimate customers, invoice customers/jobs, and converted lead customer/job links.
- Schedule conflict detection found no duplicate technician/date/appointment-window conflicts in the audited jobs dataset.
- Inventory had no negative stock or orphan inventory adjustments in the audited dataset.
- Tasks contained no orphan customer references, invalid technician assignments, or overdue open records at the time of audit.
- Warranties, inspections, purchase orders, and expenses were schema/path verified where live tables were empty.
- Audit logging is active. Older legacy rows without action/actor metadata were left intact rather than rewritten with invented history.
- Duplicate detection found one live cross-entity customer/lead match by both email and phone. It remains flagged for human review rather than auto-merged because merging customer/lead records is destructive and can change attribution/history.
- Vercel production and relevant preview deployments were verified READY, and Vercel reported no runtime-error clusters in the checked 24-hour window.

## Task 7 — Full E2E Production Test

A complete isolated flow was previously verified against production schema/policies in a rolled-back transaction under an authenticated Owner context:

- Created a QA Customer and linked Lead and Job, then created an approved Estimate.
- Converted the Estimate to an Invoice through the atomic `convert_estimate_to_invoice` RPC.
- Recorded a Card payment through the atomic `append_invoice_payment` RPC.
- Relationship and accounting assertions passed for estimate conversion, invoice customer/job links, tax, payment structure, card-fee separation, lead conversion links, and final balance math.
- The entire QA transaction was rolled back; follow-up checks confirmed that no QA customer, lead, job, estimate, or invoice remained in production.

The historical `$750` zero-rate spring allocation used in that release test is not evidence for current AI pricing behavior. Current production AI pricing is catalog-only as documented in Task 5, and zero-rate catalog items are blocked rather than assigned derived prices.

No live customer communication was sent during the E2E test.

## Task 8 — Release and post-release hardening

The release was completed. Post-release audits subsequently hardened Square invoice-link integrity, AI technician pricing, AI receptionist call-outcome preservation, SMS normalization/consent handling, approval hashing, and communication error states.

Remaining verification/follow-up items are intentionally explicit:

- Populate real prices for the currently unpriced Product Catalog items before broad AI-generated service-document pricing is enabled.
- Obtain a genuine post-V3 Ashley call before claiming hosted-agent behavior is end-to-end verified.
- Identify and publish a verified EZfix logo asset over an appropriate public HTTPS path before setting `email_logo_url`.
- Review the seven remaining Supabase `SECURITY DEFINER` advisor warnings function-by-function instead of revoking application access blindly.
- Continue syncing the exact live Supabase edge-function source into GitHub so later releases do not overwrite server-side hardening.