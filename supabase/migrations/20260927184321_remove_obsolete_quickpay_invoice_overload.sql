-- Applied to production as Supabase migration 20260927184321.
-- Removes the obsolete 8-parameter Quick Pay invoice overload.
-- The current 10-parameter function remains authoritative and is the only
-- version called by the CRM, including parts-cost/parts-owner handling.

drop function if exists public.technician_create_quickpay_invoice(
  text,text,text,text,text,jsonb,numeric,text
);