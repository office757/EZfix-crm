-- Massachusetts repair/service invoices tax separately stated tangible parts/materials,
-- while separately stated labor/service is not included in the taxable property charge.
-- Keep the EZfix product catalog aligned with that invoice model.

update public.products
set taxable = false, updated_at = now()
where (lower(coalesce(category_id,'')) = 'labor' or lower(coalesce(category,'')) = 'labor')
  and taxable is distinct from false;

alter table public.products
  drop constraint if exists products_labor_non_taxable;

alter table public.products
  add constraint products_labor_non_taxable
  check (
    not (
      (lower(coalesce(category_id,'')) = 'labor' or lower(coalesce(category,'')) = 'labor')
      and taxable is true
    )
  );
