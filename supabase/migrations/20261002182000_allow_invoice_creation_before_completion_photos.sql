-- Invoice creation must not be blocked by job photo evidence.
-- Photos are still enforced by private.enforce_job_workflow() before
-- work_finished / invoice_sent / paid / completed workflow transitions.
drop trigger if exists enforce_invoice_evidence on public.invoices;

comment on function private.enforce_invoice_evidence() is
'Legacy invoice evidence guard retained for reference. Invoice creation is no longer blocked by job photos; photo evidence remains enforced by the job workflow before work_finished/invoice_sent/paid/completed transitions.';
