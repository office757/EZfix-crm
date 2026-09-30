# EZfix CRM working rules

## Approved appearance freeze
David explicitly approved the current application appearance on September 29, 2026 (America/New_York). Do not change layout, colors, typography, spacing, icons, navigation design or other visual styling unless David explicitly requests the specific change. Preserve the approved desktop and mobile appearance while fixing functionality.

Approved baseline: commit `0661ca717858e22755e48b7e9fb13a8596b41cac`.
Backup branch: `backup/approved-ui-20260930`.
This is a source/UI backup, not a backup of database records, uploads or service credentials. Restore only intended presentation changes; do not roll back unrelated later functional fixes.

Current explicit exception: add emoji-labelled WhatsApp, Email and SMS controls inside Ashley using existing messaging functionality. No Facebook or Instagram controls are requested. Preserve current styling and existing sending safeguards.

David also explicitly requested consolidating Communications into Ashley and removing its duplicate owner navigation entry. Preserve staff access and existing message history and links.

David additionally authorized Ashley tool tiles, moving AI Manager under Ashley, and keeping Follow-Up & Tasks inside Office instead of duplicate owner navigation.

Approved final mapping: Office and Follow-Ups & Tasks in Daily Work; Finance only Estimates, Invoices, Payments, Banking; Receipts, Inventory and Suppliers inside Office; Products & Services grouped with Gallery and Visualizer. Ashley message surfaces use gentle channel-specific backgrounds. David authorized shipping these on September 29, 2026.

David additionally requested moving the owner's Social Media and business Settings entry points into Ashley, removing their trailing sidebar/More entries. Preserve Office social access and distinguish Business Settings from Ashley Settings.

David additionally requested Customers and Follow-Ups & Tasks inside Office, removing their duplicate owner/office sidebar entries. Keep technician and marketing customer access. Rename Gallery & Visualizer to Useful Tools and place it above Team & Payroll in both navigation and tool launchers (September 29, 2026).

David requested Team Performance and Tech Payroll inside Team, Payments inside Banking, and a permanently open sidebar without category headings or collapsible groups. Keep existing role permissions and nested page links (September 29, 2026).
