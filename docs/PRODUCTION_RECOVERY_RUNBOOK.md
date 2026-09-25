# EZfix CRM — Production Recovery Runbook

Last verified: 2026-09-25

## Production identifiers

- GitHub repository: `office757/EZfix-crm`
- Production branch: `main`
- Vercel project: `ezfix-crm-sms-length-fixed`
- Vercel project ID: `prj_2FlUOt4JkV4XqGKxdcsdw0y6v3Mn`
- Supabase project: `EZfix Garage Doors Inc Project`
- Supabase project ref: `fylbalenuqpovwncwbah`
- Supabase region: `us-east-1`
- PostgreSQL: 17.x

## Recovery principles

1. Do not restore the database for a frontend-only failure.
2. Prefer a forward-fix migration over reversing schema history.
3. Do not retry uncertain payment, SMS, WhatsApp, or phone-provider outcomes automatically.
4. Preserve the incident timestamp, current Git commit, Vercel deployment ID, Supabase migration state, and relevant provider IDs before making a recovery change.
5. A database restore or PITR action can cause downtime and data loss after the selected recovery point. It requires explicit Owner approval.
6. Supabase database backups do not restore Storage objects that were deleted after the backup. Storage recovery is a separate concern.
7. Never delete a Supabase project as a recovery step. Project deletion also removes platform-held backups.

## Before every production schema change

- Confirm the change is represented by a committed migration file.
- Run the relevant focused regression audit plus `scripts/crm-safety-audit.mjs --strict`.
- Compile/test the migration against production schema inside `BEGIN; ... ROLLBACK;` when safe.
- Run Supabase Security Advisor after DDL/security changes.
- Verify the Vercel Preview deployment is READY and has no error/fatal runtime logs.
- Record the production Git SHA after merge.
- For consequential provider changes, verify no customer message/call/payment was emitted by deployment itself.

## Recovery decision tree

### 1. Frontend/UI regression only

Use Vercel rollback or redeploy the previous known-good production commit.

Do **not** restore Supabase.

After rollback:
- verify the production deployment is READY,
- check error/fatal runtime logs,
- open the affected CRM module,
- confirm Supabase data is unchanged.

### 2. Edge Function regression only

Prefer redeploying the previous tracked Edge Function source from GitHub.

Do **not** restore the database unless the function already corrupted data.

After redeploy:
- confirm the function is ACTIVE,
- confirm `verify_jwt` still matches the intended security boundary,
- compare the deployed SHA with the tracked source,
- run a non-destructive smoke test,
- inspect provider/database logs for duplicate external side effects.

### 3. Bad database migration without customer-data corruption

Prefer a new forward-fix migration.

Rules:
- never edit an already-applied production migration in place,
- create a new migration with the correction,
- validate it in a transaction/rollback first where possible,
- keep RLS, grants, triggers, and function ACLs explicit,
- rerun Security Advisor.

This is the default response for schema/permission/function mistakes.

### 4. Data corruption or destructive migration

Stop consequential writes first where possible.

Capture:
- incident time in America/New_York and UTC,
- current `main` SHA,
- latest Vercel production deployment ID,
- latest Supabase migration version,
- affected tables/entity IDs,
- Square/Inkbox/Meta/Resend provider IDs if relevant.

Then choose one of:

#### Daily backup restore
Supabase documentation states paid Pro/Team/Enterprise projects receive daily database backups with retention based on plan.

Verify the actual project backup list in **Database → Backups** before relying on it.

Select the closest backup made **before** the incident.

#### Point-in-Time Recovery (PITR)
Use PITR only if it is enabled for this project.

Choose a recovery timestamp before the damaging transaction.

Supabase restore causes project downtime while recovery runs.

**Never start a restore without explicit Owner approval.**

### 5. Storage object loss

Database restore is insufficient for deleted Storage objects because database backups contain Storage metadata, not deleted object bytes.

Recovery therefore requires:
- a separate copy/export of critical Storage bucket objects, or
- restoration from whatever external copy is retained for those files.

Do not claim a DB restore will recover deleted photos/PDFs/files.

## Payment-provider incident rules

### Square

If Square outcome is uncertain:
- do not create a second payment/link automatically,
- inspect the stored Square order/payment/link identity,
- use the explicit Square reconciliation/check flow,
- confirm the amount against authoritative invoice balance,
- preserve card surcharge vs invoice principal separation.

### SMS / WhatsApp / Inkbox voice

If provider acceptance is uncertain:
- do not automatically resend/retry,
- check provider event/call/message IDs first,
- preserve consent/opt-out state,
- resolve ambiguous identities manually.

## Post-recovery validation

Run at minimum:

- `node scripts/crm-safety-audit.mjs --strict`
- relevant module-specific audits
- production Vercel build/runtime verification
- Supabase Security Advisor for any schema/security change
- Edge Function inventory/source SHA check when functions changed
- financial validation if invoices/payments were involved
- call/SMS/WhatsApp dedupe checks if communications were involved

Validate these core invariants:

- no orphan Customer/Lead/Job/Estimate/Invoice references,
- no duplicate conversion targets,
- no negative inventory from recovery,
- no duplicate payment IDs,
- no paid invoice reverted to unpaid,
- no completed Job reopened unless intentionally restored,
- no outbound communication replayed automatically,
- no callback authorization reused after consumption.

## Backup verification checklist

Because the connected Supabase tooling in this environment does not expose the project's scheduled-backup list or plan retention, verify these items in Supabase Dashboard:

- Database → Backups shows recent scheduled backups.
- Confirm the oldest available recovery point / retention window.
- Confirm whether PITR is enabled.
- Record the last successful backup timestamp.
- Confirm who has Owner/Admin access to perform a restore.

If scheduled backups are unavailable, configure an external logical backup process using Supabase CLI `db dump` with credentials stored only in a secure secret store.

## Restore authority

Database restore, PITR restore, project pause/delete, destructive table truncation, and mass customer-data rollback are **Owner-confirmed actions only**.

Routine forward-fix migrations, source redeploys, read-only verification, and rolled-back test transactions can be performed without invoking a destructive restore.
