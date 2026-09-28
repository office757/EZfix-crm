# Office secretary role

The Owner can choose **Team → + Office user**, enter the secretary’s real name/contact details, and continue directly to Login Access to set an email and password. No placeholder identity, password or actual secretary account was created by this release.

Office users land in a dedicated workspace with communications, email composing, SMS threads, call history/audio, calendar, jobs/leads, customers, tasks, estimates, invoices, payments/Quick Pay, products, inventory, suppliers/orders, expenses, team, commission/payroll reports, photos and social drafts. The existing company communication and billing integrations are reused. Customer opt-outs and server delivery confirmations remain enforced.

Office can update technicians’ contact information, availability and commission. Role changes, login credentials, user removal, provider secrets and owner configuration remain Owner-controlled. RLS grants match the UI. Raw settings are replaced with a narrowly scoped read API for operational settings. Social drafts are private to Owner/Office; publishing is marked manual only with a supplied post link.

Instagram, Facebook and Google Business Profile connections are still pending the final integration stage. This release persists captions, platforms, selected project photos, planned dates and review status. Planned dates do not send reminders or publish automatically. Email replies use the existing company mailbox; this is not a new connected mailbox.

A further regression check found the optional job date was serialized as an empty string. The job form now stores null for an unscheduled job, so assigning its technician can save successfully.

Validation: 18 Office RLS/database assertions with all synthetic data rolled back; production UI handlers, actual email authorization handler and SMS authorization block tested with isolated provider stubs; full release pipeline. No real messages, payments, user removal or social publication occurred during testing. Browser visual verification remains unavailable because the runtime denies browser socket creation.
