-- Applied to production. Removes the legacy public invoice RPC that accepted
-- only an invoice id and did not require an access token.
-- The token-bound get_public_invoice_payment_page(text,text) remains authoritative.

drop function if exists public.get_public_invoice_payment_page(text);