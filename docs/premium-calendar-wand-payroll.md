# Premium calendar, contextual drafting and technician settlements

The original sidebar logo and EZfix customer document branding remain unchanged. The monthly calendar follows the supplied desktop/mobile reference: blue/navy/yellow live counters, white month grid, selected blue day, compact event chips, bottom selected-day agenda, and mobile event dots. Month/day calculations keep local calendar dates. Week/day scheduling geometry is unchanged. Working screens and dialogs have consistent rounded controls, outlined icons, focus states and restrained glossy blue primary buttons; Quick Payment remains yellow in navigation and its Add Item remains blue.

## Magic wand

Estimate and invoice editors and Quick Payment accept a service description, request a real server-side AI draft, preview catalog-priced items and wording, and apply only after the user reviews it. Applying replaces current lines but does not save, send, approve, mark paid or change owner edit privileges. Only active catalog IDs are accepted; AI cannot invent prices. Technician generation requires an assigned job. Customer receipt generation selects a fully paid invoice and downloads the existing receipt PDF. Social drafts retain the existing topic-driven long caption and matching image flow with the same wand presentation. Publishing remains an explicit action; external social account publishing is not connected.

## Technician file

Team → Tech Payroll → Technician file & payments. The default period is the last completed Sunday-to-Sunday week. The start is included and the end is excluded, so adjacent periods do not overlap. The existing payroll report remains a projection; saved settlements include only jobs assigned by technician ID, completed, with every linked invoice fully paid. Commission uses discounted revenue before sales tax and processor surcharges, less parts. Parts bought by the technician are reimbursed separately. Cash held by a technician is zero by default and must be explicitly confirmed before it offsets the amount payable. A negative balance is owed to the company.

Server-calculated immutable snapshots reserve each included job atomically, preventing overlap and double settlement. Save requests and payment requests are idempotent. Unpaid statements can be voided for corrections; paid statements cannot be voided. Job or payment changes after preview require a new preview before saving. The owner can record partial/completed external bank, Zelle, cash or check payments with a date, reference and confirmation. No bank money is moved by recording. Download/share exports the saved statement and actual payment history as a multi-page PDF. This is a commission settlement statement, not a statutory employee payroll tax/withholding pay stub.

Owner-configured weekly reminders are saved per technician with weekday, hour and one of four US time zones. An hourly database cron queues one in-app payment review notice per local weekly period even when the app is closed. Reminders default to disabled. Clicking the notice opens the technician file.

## Verification and follow-up

Release gates and financial unit checks cover tax/card-fee exclusion, company/technician parts, actual cash offset, refunds, partial/failed/pending payments, incomplete jobs, period boundaries, catalog validation and script parsing. Database tests run in a rolled-back transaction and cover immutable snapshots, overlapping jobs, idempotent payments, partial/full settlements, overpayment and void rejection, owner checks, grants and RLS. DOM integration covers preview → save → PDF → confirmed payment and wand review → apply. No real technician payment or reminder setting is created by tests.

Remaining integration work: outbound bank disbursements with provider verification/webhooks; Facebook/Instagram/Google Business automatic publishing with account authorization; unified Ashley/BOOYA orchestration and campaign approvals; multi-business onboarding/branding isolation. Statutory payroll deductions require a payroll provider. Real production user flows still need review in the signed-in browser; no visual screenshot verification is claimed by the automated checks.
