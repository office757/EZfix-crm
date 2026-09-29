# CRM regression and payroll corrections — September 29, 2026

Baseline: `f4298b4412499c613d968047a24fa7a88fbf7a9c` on main, matching
READY production deployment `dpl_sNqUbyHsCUZjuY12cAWo7vgn2Yo1`.

## Reproduced and corrected

The payroll report grouped technicians by current and historical display names.
A renamed technician's one $1,000 job with $200 technician-paid parts appeared
twice. At 30% commission, the combined cards displayed $640 instead of $440:
the historical-name card reimbursed the same parts a second time. Two different
technicians with the same name also shared a report identity. Separately, only
the first linked invoice contributed revenue, and CSV export matched names
instead of the identity used by the on-screen report.

- Group by the saved team ID and use names as labels. Name-only legacy jobs map
  to a roster member only when the name is unique; ambiguous records remain in
  one clearly labeled legacy group for review. Historical jobs with a saved ID
  remain grouped even if the roster member is unavailable.
- Include every non-deleted invoice linked to a job. Keep the existing pre-tax,
  after-discount commission basis and deduct parts once per job. Card fees stay
  outside commission, and technician-paid parts are reimbursed once.
- Use the same calculation for cards and CSV, including invoice numbers, saved
  technician ID, commission rate, profit, parts payer, reimbursement and payout.
- Key temporary report-rate overrides by technician ID; names with apostrophes
  no longer break the inline input handler. Out-of-range rates are rejected.
- Calculate payroll date presets using the browser's local calendar date.

This is a report correction. It does not modify saved invoices, jobs, payments,
commission defaults or provider settings. Read-only production inspection found
zero current name/ID mismatches and zero jobs with multiple active invoices.

## Verification

- All **58 baseline release steps** passed before edits.
- All **59 updated release steps** passed, including **15 executable payroll
  cases** covering renamed and duplicate names, legacy identity, multiple
  invoices, tax/fees, parts payer, deleted rows, date ranges, CSV parity,
  export access, apostrophes and local-date boundaries in New York and Tokyo.
- Strict CRM safety audit: **22 passed, zero warnings or failures**.
- Existing parts/payroll audit: **10 passed**.
- Current live-schema rollback suites: **188 passed**:

| Suite | Checks |
| --- | ---: |
| Technician assignment, estimate order, archived access | 18 |
| Office operational permissions and owner-only controls | 18 |
| Lead, technician acceptance, photos, invoice, payment, receipt, signature | 38 |
| Offer channels | 18 |
| Dispatch revalidation | 9 |
| Unified app/SMS/WhatsApp acceptance | 72 |
| Atomic website appointment and retry/recovery | 15 |

All seven database suites ended with rollback. Follow-up found no new retained
QA leads on September 29 and no QA customers, jobs, team rows, invoices or
synthetic auth users. Five QA-prefixed leads created on September 28 already
exist; they were left untouched. No customer messages or charges were sent.
Provider delivery rows in the rollback tests are synthetic correlation fixtures.

Read-only integrity checks found zero duplicate job/invoice numbers, orphaned
invoice-to-job links, or completed jobs missing a completion signature. The
baseline Vercel 24-hour runtime error scan found no reported error clusters.
The live GET-only route smoke passed **7/7** for the root, CRM, CRM with query,
sign-in, public invoice, estimate signature and password pages.

Supabase's separate 24-hour log review did contain 13 HTTP 5xx responses, so the
Vercel result must not be read as a clean backend bill of health. Eight REST 502
responses and one call-lead processor 500 were clustered between 12:49 and 12:52
UTC on September 29. Four older function errors concern WhatsApp, assignment SMS
and replay on September 28. These are operational observations, not failures
reproduced by the payroll patch; their underlying causes are not established by
the aggregate logs.
The follow-up window after 12:52:02 UTC through about 15:25 UTC showed successful
responses on all five affected routes and zero further server errors there:
1,441 calls reads, 832 lead-offer reads, 30 team reads, 33 settings reads and
27 call-lead processor runs. Recovery is observed; the original cause is unknown.

## Remaining acceptance

This regression pass does not certify every live handset/customer integration.
Issues #133–#139 remain the acceptance backlog. Real customer payment/signature,
provider-backed messaging and iPhone/iPad acceptance need their own evidence.
The local agent-browser daemon failed at startup, so no new browser visual pass
is claimed for this change; the actual payroll renderer and handlers were
executed in isolated tests.

Read-only current configuration: three active technicians have linked logins;
there is no actual Office login yet. Dispatch remains in Recommendations mode.
Of 166 active catalog items, only two have positive prices; broad AI pricing
therefore remains intentionally unavailable until business prices are supplied.
Meta/WhatsApp connections, real secretary identity, routing inputs, and the
previously documented password-protection/backup verification remain separate
owner/provider completion items. Original recordings remain separate from the
owner-accepted, labeled synthetic transcript replay.
