# EZfix CRM working rules

## Approved appearance freeze
David explicitly approved the current application appearance on September 29, 2026 (America/New_York). Do not change layout, colors, typography, spacing, icons, navigation design or other visual styling unless David explicitly requests the specific change. Preserve the approved desktop and mobile appearance while fixing functionality.

Approved baseline: commit `0661ca717858e22755e48b7e9fb13a8596b41cac`.
Backup branch: `backup/approved-ui-20260930`.
This is a source/UI backup, not a backup of database records, uploads or service credentials. Restore only intended presentation changes; do not roll back unrelated later functional fixes.

Current explicit exception: add emoji-labelled WhatsApp, Email and SMS controls inside Ashley using existing messaging functionality. No Facebook or Instagram controls are requested. Preserve current styling and existing sending safeguards.
