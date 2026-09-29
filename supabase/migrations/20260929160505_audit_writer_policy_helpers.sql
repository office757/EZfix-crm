-- Existing PUBLIC team SELECT policies evaluate is_office() for every querying role.
-- Grant only the role predicates needed by those policies, without business write access.
grant execute on function public.is_office(),public.current_app_role() to crm_audit_writer;
-- Keep the actor lookup restricted even when the caller is Owner/Office.
create policy audit_writer_actor_only on public.team as restrictive for select to crm_audit_writer using(auth_user_id=(select auth.uid()));
