-- Keep invoice payment links invoice-specific at the database boundary.
-- Application code already validates Square links before rendering PAY NOW;
-- this constraint prevents a mismatched checkout link from being stored at all.

alter table public.invoices
  drop constraint if exists invoices_payment_link_square_chk;

alter table public.invoices
  add constraint invoices_payment_link_square_chk
  check (
    nullif(btrim(payment_link), '') is null
    or (
      payment_provider = 'square'
      and payment_link ~ '^https://checkout[.]square[.]site/'
      and regexp_count(payment_link, '[?&]client_reference_id=') = 1
      and substring(payment_link from '[?&]client_reference_id=([^&]*)') = number
    )
  );
