# EZfix CRM completion QA status

Last verified: 2026-09-23
Working branch: `fix/card-surcharge-accounting-2026-09-23`

## 8-task release plan

1. Financial QA — **COMPLETE**
2. Payment Integrity — **COMPLETE**
3. Security QA — **COMPLETE (with documented platform warning)**
4. Documents & Communications — **COMPLETE**
5. Ashley + Phone — **COMPLETE (with documented provider limitation)**
6. Operational QA — **NEXT**
7. Full E2E Production Test — pending
8. Release — pending

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

Production database and frontend now use the atomic `append_invoice_payment` RPC.

Verified in a rolled-back production transaction:

- A new payment increments the invoice payment array exactly once.
- Replaying the same payment ID is idempotent even when the caller presents the original stale row version.
- Two different payments attempting to use the same stale row version do not overwrite one another: the second attempt is rejected with SQLSTATE `40001` and the first payment remains the only appended record.
- Payment records carry stable IDs.
- The RPC requires a positive applied amount, a payment ID, an expected row version, and a live non-deleted invoice.
- Frontend payment recording re-reads the authoritative invoice before invoking the RPC and refreshes the in-memory invoice from the returned database row.

Production migration for atomic payment recording is applied.

## Task 3 — Security QA

Verified directly against production Supabase using rolled-back role simulations:

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

No critical app-authorization finding remains. The advisor currently reports:

- Seven warnings for intentionally exposed SECURITY DEFINER helper/RPC functions. These are retained because they are used by RLS / controlled RPC flows and have fixed search paths plus authorization guards where needed.
- Supabase Auth leaked-password protection is disabled. This is an external Auth project setting rather than an application/database-policy defect; enable it in Supabase Auth settings when management access for that setting is available.

## Task 4 — Documents & Communications

Verified the document and outbound-communication paths without sending unintended customer messages:

- Estimate/Invoice totals use the same discount/tax calculation model as the financial layer.
- PDF/receipt/deposit rendering uses `paymentAppliedAmount(...)`, so card surcharge is not shown as invoice principal.
- Text/document exports use invoice-applied payment amounts and the authoritative remaining balance.
- Direct Square Pay Now links are validated as HTTPS `checkout.square.site` links tied to the exact invoice number through `client_reference_id`.
- Card fee disclosure is shown separately from the invoice balance when Pay Now is available.
- `send-crm-email` requires authenticated active staff, and non-owner sends require a fresh matching communication approval; approvals are consumed atomically and attachment/recipient/body hashes are verified.
- `send-inkbox-sms` requires authenticated authorized staff, enforces consent/STOP rules, validates message size/recipient, and suppresses duplicate service sends.
- `send-whatsapp-notification` requires authenticated authorized staff, validates recipient/message, suppresses duplicates, and logs successful sends.
- Provider failures are surfaced rather than silently reporting success, and successful communication attempts are logged/audited.
- Production `invoice-email-preview` was upgraded to version 8 so paid/balance calculations explicitly prefer `appliedAmount` and fall back to legacy `amount`; this preserves legacy compatibility while preventing card fees from reducing invoice balance.
- The deployed `invoice-email-preview` remains JWT-protected and the exact production source is now tracked at `supabase/functions/invoice-email-preview/index.ts`.

No live customer email/SMS/WhatsApp was sent during this QA pass.

## Task 5 — Ashley + Phone

Verified the production Ashley / phone / technician-assistant stack:

- `sync-inkbox-calls`, `process-inkbox-call-leads`, and `inkbox-webhook` are active and preserve call/transcript history in production.
- Ashley hosted-agent guardrails are managed server-side: collect caller details, never invent pricing, treat requested appointment windows as preferences until confirmed, and never claim booking/assignment/payment/transfer success without provider confirmation.
- Call processing links known callers to customers, creates or links leads when appropriate, records missing caller fields, and flags guardrail violations for review.
- Technician assignment is permission-controlled and is currently disabled for Ashley; a caller preference is not treated as an assignment.
- The human-transfer target is `+1 774-244-5533`. The current hosted-agent provider surface does not expose a verified dynamic mid-call transfer action, so the system does not pretend a transfer occurred. When a human is requested and provider forwarding is not confirmed, the database trigger `enqueue_ai_receptionist_human_followup` creates an idempotent high-priority callback task.
- The human-callback trigger was verified in a rolled-back production transaction: an unfulfilled human request created the expected high-priority task with call ID, callback phone, transfer status, and transfer target; rollback left no test data behind.
- `ai-technician-assistant` is active, JWT-protected, role-aware, supports Hebrew requests, uses the live product catalog, and returns draft-only financial documents that require approval rather than persisting them directly.
- `ai-service-document-approval` is active and independently recomputes totals, validates catalog product IDs and job context, and queues a pending approval instead of directly creating/sending a financial document.
- Technician document preparation is restricted to the technician's assigned job context. Owner/admin/office approval remains required before a financial document can be created/sent.
- The requested Hebrew workflow is supported: a request such as `תעשה לי קבלה על קפיצים כולל מיסים ב750` is parsed as a receipt draft for spring work with a $750 tax-inclusive target, professional catalog descriptions, parts/labor lines, tax reconciliation, and approval controls.
- During QA, the product catalog was found to mark all labor items taxable. This was corrected in production: all 9 Labor-category items are now non-taxable, and the validated `products_labor_non_taxable` database constraint prevents that classification from regressing. The matching migration is tracked in GitHub.
- With the current zero-rate generic spring/labor catalog draft allocation, the $750 example reconciles to $502.99 parts + $215.57 labor + $31.44 MA sales tax = $750.00; spring type/quantity remains explicitly flagged for review when the technician did not specify it.

### Provider limitation

The phone provider currently supports hosted-agent inbound handling and forwarding modes, but a verified dynamic hosted-agent mid-call transfer tool is not exposed in the connected production integration. EZfix therefore uses a safe fallback: preserve the caller/callback context and create a high-priority human callback task rather than claiming a transfer succeeded.

## Next verification target

Task 6: Operational QA — verify Customers, Leads, Jobs, Schedule, Inventory, Tasks, operational data integrity, audit coverage, and production failure handling before the full end-to-end release test.
