// Supabase Edge Function: inkbox-sdk-test
//
// Isolated test only:
// verifies that @inkbox/sdk can load inside Supabase Edge Functions.

import { verifyWebhook } from "npm:@inkbox/sdk";

Deno.serve((_req: Request) => {
  const result = {
    runtime_loaded: true,
    typeof_verifyWebhook: typeof verifyWebhook,
    is_function: typeof verifyWebhook === "function",
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
});