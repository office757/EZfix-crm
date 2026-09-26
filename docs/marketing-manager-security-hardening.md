# Marketing Manager security hardening follow-up

This note records a live-schema finding discovered during QA. It intentionally does not mutate production.

## Finding
Supabase Security Advisor flags `public.marketing_manager_metrics` because the view currently runs with `security_invoker=false`. The source table `public.marketing_daily_metrics` has RLS enabled. Its current Marketing Manager SELECT policy is deliberately `USING (false)`, while owner access is allowed separately. Therefore, simply switching the view to `security_invoker=true` would break Marketing Manager access rather than safely fix the warning.

`public.is_marketing_manager()` is a SECURITY DEFINER helper and is currently executable by `anon` and `authenticated`. Anonymous execution is unnecessary.

## Safe migration sequence
Create a migration with Supabase migration tooling and validate it inside BEGIN/ROLLBACK before applying:

1. Replace the current Marketing Manager `USING (false)` SELECT policy on `public.marketing_daily_metrics` with a narrowly scoped Marketing Manager SELECT policy using `public.is_marketing_manager()`. Keep the separate owner policy unchanged.
2. Keep INSERT/UPDATE/DELETE unavailable to Marketing Manager unless a separate workflow explicitly requires them.
3. Set `public.marketing_manager_metrics` to `security_invoker=true`.
4. Revoke EXECUTE on `public.is_marketing_manager()` from PUBLIC and anon.
5. Grant EXECUTE on `public.is_marketing_manager()` only to authenticated and service_role if required by RLS.
6. Re-run Supabase Security Advisor and the static security-contract audit.
7. Verify an actual Marketing Manager session can read metrics but cannot read invoices, payments, expenses, payroll, settings, credentials, or owner-only data.

Do not deploy this change as an ad-hoc SQL patch. Keep it migration-backed, tested, and reversible.
