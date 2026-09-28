-- Supabase owns auth and does not let postgres grant schema usage directly.
-- Only the non-login RPC role inherits the authenticated interface; no client gains this role.
grant authenticated to crm_workflow_executor with inherit true, set false;
