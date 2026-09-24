-- Remove anonymous table grants from Owner/AI Office audit and permission tables.
revoke all on table public.ai_permissions from anon;
revoke all on table public.ai_approvals from anon;
revoke all on table public.ai_actions from anon;
