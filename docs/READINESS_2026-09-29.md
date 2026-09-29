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

## Follow-up: Team Performance and history ordering

Baseline: main `1e3633f8d3c85b0c9d342eac24be542dee77bc92`, deployed by
READY production deployment `dpl_ACHqn6YoJouvr9unjUkSrAkud8AA` after PR #185.

Two further defects were reproduced from the production source:

- Team Performance still grouped by display name. A single renamed technician's
  $1,000 invoice was counted twice in the report total. It now shares the payroll
  identity resolver, separates same-name people by saved ID, labels ambiguous
  legacy assignments and excludes deleted jobs/invoices. The existing invoice
  tax-inclusive revenue and applied-payment calculations are preserved.
- History comparators subtracted database ISO timestamp strings, producing NaN
  and leaving mixed-source events in collection order. One shared timestamp
  parser now handles server strings and legacy numeric timestamps. It is used
  by audit/communications/customer history and the affected notification,
  document, inventory, expense and supplier lists. Newest-first lists stay
  newest-first; SMS conversations stay oldest-first. Stored dates are unchanged.

The new executable report/history audit passes 14 cases. Together with the
15 payroll cases, 29 targeted tests pass; strict safety checks remain 22/22.
All 60 release steps passed with the new audit included.
The tests execute the production renderers and calculations with synthetic
records. They cover duplicate/renamed identities, deleted records, all linked
invoices, tax and payment accounting, access guards, escaped names, mixed
timestamps, merged communication sources, the newest-200 history cutoff and
ascending SMS order. They do not substitute for browser/handset acceptance.

## Current closeout checklist

Read-only configuration and source inspection in this follow-up distinguish
implemented infrastructure from the work still required. Broad issues #133–#139
remain open; the table is not a claim that every item in those issues is broken.

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| Technician earnings | Personal My Earnings page implemented; 18 UI/calculation/identity tests and 11 live-schema permission checks pass; signed-in owner preview verified two technician reports, date presets and job links | Final acceptance in a real technician login, including mobile |
| Activity history | Searchable actor/time/record history and before/after values implemented; 17 business tables record changes atomically; 14 renderer tests and 16 live-schema checks pass; signed-in owner filters, details and record links verified | Older events cannot supply details that were never recorded |
| Payments and signing | All 13 Square-backed invoices have payment links; rollback workflow checks passed; an existing settled invoice, delivered receipt, scoped customer page and signed estimate were verified live; invalid invoice token exposes no document | A new coordinated signing/payment/receipt acceptance remains; existing records do not prove a new checkout settlement |
| Website intake | A current website submission returned HTTP 200 and created its linked appointment; the saved appointment date now appears correctly in the review form | Office must review required contact/address/ZIP details before dispatch; no coordinated test submission was sent in this pass |
| SMS/email | 44 SMS rows have provider delivery confirmation and none are failed in the inspected set; 20 email-delivered events exist | Complete the required current handset/recipient acceptance; these counts do not certify every future send |
| Google Ads/social/WhatsApp | No Google Ads connection rows and no marketing OAuth connection rows; WhatsApp integration alert remains | Connect owner-selected provider accounts and verify real delivery/marketing flows |
| Office account | Office role and authorization are implemented; no real Office login exists | Owner supplies the actual staff name and email; provision that person |
| AI pricing and dispatch | Only 2 of 166 active catalog items have positive prices; routing is Recommendations; all 3 enabled technician profiles explicitly contain demo data | Replace demo hours, travel, skills and cost inputs with owner-approved business values; supply actual prices before enabling automated pricing/dispatch |
| Mobile/desktop acceptance | Owner desktop sign-in and the new history/earnings flows were verified in the live browser | Actual technician login, iPhone and iPad acceptance remains |
| Operations | Backend recovered after the documented transient 5xx cluster; latest advisor confirms leaked-password protection is disabled | Enable/verify password protection, verify backup/recovery settings, and review the earlier backend incident |

No live customer message, live charge, invented staff account, routing-mode
change or replacement of demo profiles was made by this report/history patch.

## Personal earnings and detailed activity closeout

Baseline: main `f63a3d7ba7ce2e6c92e29834a9a11b309e156fd0` after PR #186.

### Personal earnings and technician workspace

- My Earnings appears in the technician's More tools. It shows only jobs linked
  to the signed-in team ID, with period presets, invoice revenue before tax,
  parts cost/payer, saved commission, parts reimbursement, calculated payout,
  customer payment/balance and direct job access. It has no commission editor.
- The same payroll calculation serves the office and personal report. Personal
  reports ignore temporary office overrides and ambiguous legacy name matching.
  A missing commission rate is visibly unconfigured; a configured zero stays zero.
- The page distinguishes calculated earnings from actual payroll payments and
  flags unscheduled, incomplete and uninvoiced work.
- Actual technician login clears the owner-only VIEW_AS label. The dashboard,
  calendar and lead lists previously filtered using that empty label; they now
  use the signed-in ID. A saved owner calendar technician filter cannot hide the
  technician's own appointments. Duplicate-name owner previews fail closed.

### Durable activity history

- Owner history has search, record/source/date filters, pagination, exact local
  timestamps, actor labels, recorded reasons, record links and before/after values.
  Provider callbacks and remote customer signatures are distinct from the person
  who originally requested a send or created the signing link.
- A private database trigger records changes on 17 business tables in the same
  transaction. An isolated role can insert history and read the caller's actor
  label; it cannot edit jobs/invoices or delete history. Client updates remain
  limited to read acknowledgement. Existing workflow/provider logs remain.
- Snapshots use an explicit business-field allowlist. Provider tokens, arbitrary
  app_data, raw signatures and photo URLs are excluded. No historical data was
  backfilled or reconstructed; missing reasons and actors remain labeled unknown.

### Verification and deployment notes

- 18 personal earnings/workspace cases, 13 detailed-history cases, plus the
  existing 15 payroll and 14 report/history cases pass: **60 targeted cases**.
- All **62 release steps** pass after the technician calendar/lead fixes. The
  calendar fixture now executes the production identity helpers with an actual
  technician identity and an empty owner preview label.
- All nine live-schema rollback suites pass: **215 checks**, including the
  188 workflow checks above and 27 new earnings/history assertions. Follow-up
  found no retained new QA customers, jobs, invoices, team rows or history.
- Local PostgreSQL simulation tested trigger behavior and least privileges.
  Live-schema testing then exposed two environment-specific mismatches: the
  existing PUBLIC team policy needed its role-helper grants, and the existing
  source constraint needed the new database source. Both corrective migrations
  were applied, followed by the complete passing rollback run. The inspected
  HTTP log window from 16:00 UTC through the follow-up contained no 4xx/5xx rows.
- Security advisors report no new public audit function. Existing token-backed
  public document APIs, authenticated helpers and private tables remain noted
  by the advisor; leaked-password protection is still explicitly disabled.
- Cloud browser access worked; the session was signed out at that stage. No real
  customer messages, charges or signatures were submitted during these tests.

Migration filenames match the versions recorded by the production migration
history. The two follow-up migrations are required alongside the base migration.

## Signed-in acceptance and calendar follow-up

PR #187 was merged and production deployment `dpl_AQCG8Lzh1DrFTLCYWohkRekuYZ7m`
reached READY on main `001cf60031844069315cb85b9d1b44438c49be87`. Production
HTML and all three new JS/CSS assets matched the tested files exactly; all
seven public GET route checks passed.

The owner signed in through the secure browser handoff. Live inspection verified
history source/record filters, exact timestamps, a stored before/after status
change, and its link to the correct job. Two different technician previews showed
separate earnings, saved commission rates, populated calculations, an empty
previous month and working job links. These are owner previews, not proof of
authorization in a real technician browser session; the rollback permission
tests remain separate evidence. No messages, charges, signatures or job edits
were submitted from the browser.

This pass exposed a calendar defect: text sorting placed an 8 AM appointment
after afternoon appointments, while the week parser read `2–4 PM` as starting
at 4 PM. One validated parser now interprets explicit, inherited AM/PM, cross-noon
and 24-hour windows. Month cells, the selected-day agenda, day views and popups
sort by time; week cards use the actual start and duration. Drag requests preserve
the original duration. Existing saved appointments are unchanged. Nine executable
regressions exercise actual renderers and a stubbed drag save, including unknown
times and parity with the server's dispatch parser.

History now labels the legacy app-client invoice-open event as an invoice preview
request. Source inspection confirmed it is emitted by the signed-in CRM user
calling `openPublicInvoicePage`; it is not proof of a customer visit. The recorded
actor and original database event stay unchanged. This brings history coverage
to 14 tests. All 63 release steps and all 22 strict safety checks pass.

## Continued live workflow verification

PR #188 was merged as `b93c139bd29b09be3cb3aff5dd918d255c307cac` and production
deployment `dpl_DNUXzTvZ4FRGRPbqA8KAQntrpQAc` reached READY. Exact HTML/history
asset comparison and all seven public route checks passed. The live month agenda
now shows morning before afternoon, and week view visibly places shorthand
appointments at their actual start hours.

Additional owner-browser checks verified:

- A previously settled invoice's principal, card fee and zero balance agree
  between Payments and the invoice. Its existing receipt has provider delivery
  events. No new payment or message was submitted.
- The normal Open customer invoice page action produced a working scoped link.
  The customer page showed Paid in full. Replacing its access token with a fixed
  invalid test token showed only the invalid/expired-link error and no invoice
  data. The valid token is not retained in this document or source.
- A previously signed estimate renders its approved state, signer and signature;
  the signature image and both logos loaded successfully. No signature was made.

The website lead review form exposed a mapping defect: intake stores the original
date as `preferred_date`, while the form read only `preferredAppointment`. The
linked job and database date were correct, but the review field was blank. The
form now falls back to the normalized website date only when there is no saved
CRM date. An explicitly changed or cleared CRM value takes precedence. Rendering
escapes the source value; ordinary edits retain the displayed date. Seven tests
execute the actual mapper, form and stubbed save handler. No existing lead was
edited to demonstrate the fix.

All 64 release steps and all 22 strict safety checks passed for this follow-up.
Actual technician login remains pending; the attempted separate production
alias redirected to Vercel authentication and automatic browser approval blocked
that unrequested account destination. The already-authorized CRM owner session
remains usable. No deployment protection or authentication control was bypassed.

## Approve and send offer: website ZIP and error handling

The owner reported the generic "Something went wrong" message while sending a
new website lead to a technician. PostgreSQL logs at 16:38:07 and 16:38:11 UTC
confirmed that `approve_lead_for_dispatch` rejected missing customer details.
Inspection narrowed the failure to the structured ZIP: the full service address
contained a state and ZIP, but `app_data.zip` was absent. The dialog let the RPC
rejection reach the generic global handler, hiding the actionable reason.

The approval dialog now includes a service ZIP field. A separately saved ZIP
takes precedence; otherwise an explicit US state plus ZIP at the end of the
entered address is offered for confirmation. Leading zeros and ZIP+4 survive;
street numbers and ambiguous address text are never guessed. The confirmed ZIP
is saved through the normal lead adapter before approval. Missing customer
details stop the action with instructions to complete Review. Server approval
rules and technician acceptance requirements remain unchanged.

The dialog handles approval errors and reads structured Edge Function error
bodies, so scheduling conflicts and other validation reasons remain visible.
Once an offer is created, the send dialog closes even if the subsequent list
refresh fails; a refresh warning cannot leave the user unknowingly resubmitting.

Validation: 15 executable approval/modal cases pass, along with the existing
14 offer UI cases and 7 website review cases. All 65 release steps and all 22
strict safety checks pass. A seven-check live-schema transaction reproduces the
missing-ZIP rejection, saves the confirmed ZIP, reuses the existing website
appointment, preserves its date/time and creates exactly one pending offer.
The transaction ends with rollback; no real offer notification was sent.

PR #189's date correction is separately merged as
`7a52ad37736407722f69a64e6f2a18be56dc4902`, with production deployment
`dpl_5iN9TpQk8hKjhzE3kK8z71aq1ff6` confirmed READY.


## Dispatch state and merged verification

PR #189's production date correction was verified in the signed-in owner review
form: the website appointment date and time now display correctly.

The 16:10–16:41 UTC backend window contained no HTTP 5xx. It included one
successful website intake and nine rejected `approve_lead_for_dispatch` calls.
PostgreSQL context places all nine at the required customer-field guard. These
were existing live attempts, not our browser submissions. The separate invalid
invoice-token 400 was our deliberate negative access test.

PR #190 reached main while this follow-up was in progress. Its confirmed ZIP
field, guarded save, actionable server errors and safe post-send refresh are
preserved. The additional list changes distinguish a website-created appointment
from a completed office conversion and name any required customer details before
dispatch. The offer dialog continues to confirm ZIP and perform the authoritative
approval. A stale dialog also rechecks office access before submitting.

Eight focused production-renderer/handler checks cover those state distinctions,
missing fields, assigned/cancelled and pending offers, a removed lead and a role
change. All **66 release steps** and **22 strict safety checks** pass on the
merged source, including both dispatch suites. No live offer, customer
message, charge, signature or business-record edit was submitted in this pass.
