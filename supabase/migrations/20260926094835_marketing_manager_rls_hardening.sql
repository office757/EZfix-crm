-- Harden Marketing Manager metrics access without changing the intended role scope.
-- Prepared on branch only; validate in BEGIN/ROLLBACK before deployment.

drop policy if exists marketing_daily_metrics_manager_select
  on public.marketing_daily_metrics;

create policy marketing_daily_metrics_manager_select
on public.marketing_daily_metrics
for select
to authenticated
using (public.is_marketing_manager());

alter view public.marketing_manager_metrics
  set (security_invoker = true);

revoke execute on function public.is_marketing_manager()
  from public, anon;

grant execute on function public.is_marketing_manager()
  to authenticated, service_role;
