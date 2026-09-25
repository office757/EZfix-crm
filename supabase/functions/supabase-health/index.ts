// Supabase Edge Function: supabase-health
//
// Purpose: prove "production host -> Supabase" connectivity, and nothing
// else. Touches no table, returns no business data, requires no elevated
// permission. Uses withSupabase({ auth: 'publishable' }) — the current
// documented pattern for the new key system, same as list-inkbox-events
// and ack-inkbox-event.

import { withSupabase } from "npm:@supabase/server";

Deno.serve(
  withSupabase({ auth: "publishable" }, async (_req, _ctx) => {
    return Response.json({ status: "ok", timestamp: new Date().toISOString() });
  })
);