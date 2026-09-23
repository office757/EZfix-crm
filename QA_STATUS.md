# EZfix CRM completion QA status

Last verified: 2026-09-23
Working branch: `fix/card-surcharge-accounting-2026-09-23`

## 8-task release plan

1. Financial QA — **COMPLETE**
2. Payment Integrity — **COMPLETE**
3. Security QA — **COMPLETE (with documented platform warning)**
4. Documents & Communications — **NEXT**
5. Ashley + Phone — pending
6. Operational QA — pending
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

## Next verification target

Task 4: verify Estimates/Invoices/PDF/Receipt rendering plus Email/SMS/WhatsApp communication paths, provider-result handling, approval/idempotency behavior, and card-fee presentation end to end without sending unintended customer communications.
