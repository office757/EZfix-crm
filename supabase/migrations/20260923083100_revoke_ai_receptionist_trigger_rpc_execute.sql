-- The AI receptionist human-followup function is a trigger implementation only.
-- It must not be directly callable through the exposed RPC API by anon or normal signed-in users.
revoke execute on function public.enqueue_ai_receptionist_human_followup() from public, anon, authenticated;

grant execute on function public.enqueue_ai_receptionist_human_followup() to service_role;
