# EZfix operational closeout — September 28, 2026

Baseline: production main `5d4fe1096c75c408764df5017098d12933c7e414`.

## Repairs

- Website intake validates real calendar dates and bounds years to 2000 through
  the current year plus five. Invalid dates preserve the lead and raw input,
  create an office review alert, and do not create a scheduled job.
- The job editor uses the same date checks and prevents selecting Completed for
  an unfinished job. Complete & Sign remains the completion path; the existing
  database signature guard still applies to every insert and update.
- Invoice email stops with a visible error if the secure payment/signature page
  cannot be prepared. PDF generation failure still permits email with the
  working customer page. Estimate email is unchanged.
- Existing website jobs can be edited before a customer record is linked,
  preserving the submitted customer name. New jobs and already-linked jobs
  continue to require a customer.
- Date-only values retain their calendar day in the viewer's time zone. Existing
  website appointment windows remain selected even when absent from the standard
  menu. The browser check reproduced both problems before these fixes.
- A guarded one-time data repair preserves the two untouched website jobs'
  original dates and flags their leads for review. Clearing their dates uses the
  signed-in Owner job editor and its normal authorization/audit path. The SQL
  aborts atomically if either reviewed record changed.

The service-only appointment transaction creates the job and lead link together,
reuses an existing job on retry, and recovers a previously unlinked website job
without duplication. Existing permission guards remain intact. Failed scheduling
preserves the lead and raises an office review alert.

## Verification completed before deployment

| Database rollback suite | Assertions |
| --- | ---: |
| Job assignment, estimate prerequisites and archived access | 18 |
| Office operations and owner-only permissions | 18 |
| Lead approval through photos, payment, receipt and signature | 38 |
| Offer channels | 18 |
| Dispatch acceptance revalidation | 9 |
| Unified cross-channel offer lifecycle | 72 |
| Atomic website appointment creation and recovery | 15 |
| Total | 188 |

All assertions passed against the production schema using rolled-back synthetic
fixtures. No customer messages, charges or retained test records were created.

Local real-handler tests cover website intake (25 cases), invoice email (four),
authenticated Square link creation (four), and job-editor assignment/date/status/
photo behavior. Completion signature (13) and strict CRM safety (22) checks pass.
These additions are wired into the release build. The full build must run on
Vercel because the local source snapshot excludes binary door-gallery assets.

Owner browser inspection confirmed the Office workspace, the Office role form
and the job editor on the baseline production deployment. Opening these forms
did not create users or jobs. Post-deployment checks are recorded separately.

## Current readiness and honest remaining acceptance

- Ben and Ira now have active linked logins. The earlier completion handoff's
  statement that their logins were missing is historical and no longer current.
- Dispatch is in Recommendations mode. Ben and Ira have no routing profile;
  the test technician profile is disabled. Actual hours, skills, travel estimates
  and costs are needed before automatic dispatch can be enabled.
- No secretary account has been invented. Creating the actual Office user needs
  the person's name and email.
- Provider-backed WhatsApp/Meta and marketing account connections, actual handset
  delivery, customer payment/signing, and iPhone/iPad acceptance cannot be claimed
  from synthetic tests. Existing open acceptance issues #133–#139 remain open.
- The owner reported Inkbox campaign approval on September 28 at 16:55 New York.
  CRM settings report SMS active. Read-only verification found 42 delivered
  outbound messages matched to processed Inkbox `text.delivered` events, the
  latest received September 28 at 17:16:04 UTC. This is delivery evidence, not an
  independent campaign-registration status lookup; no new message was sent.
- Supabase leaked-password protection is disabled; backup/PITR restore readiness
  still needs provider-dashboard evidence. No restore was attempted.
- Original call recordings remain distinct from clearly labeled synthetic replay;
  the owner accepted synthetic replay for this CRM in the prior handoff.

## Deployment evidence

PR #179 merged as `f675808933e5c119a5ea728adedc3d44e2f7dda9`; its full Vercel
preview and production builds are READY. Production deployment:
`dpl_5oB3VvM3F3TEkSYeMkQirUpoUYuc`. Website webhook v19 is ACTIVE. The atomic
appointment migration passed 15 additional rollback assertions. The two reviewed
website leads were linked to their original jobs and flagged; original dates
remain preserved. Final date-display/window fixes follow in the next release.
