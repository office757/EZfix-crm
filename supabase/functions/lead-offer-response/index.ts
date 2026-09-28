import { createClient } from "npm:@supabase/supabase-js@2.99.2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,apikey,authorization,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
const out = (body: unknown, status = 200) => Response.json(body, { status, headers });

// Custom authentication: a random 256-bit capability delivered only to the
// offered technician. GET, link previews and status requests never accept.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return out({ error: "Method not allowed" }, 405);
  if (Number(req.headers.get("content-length") || 0) > 2048) return out({ error: "Invalid request" }, 400);
  const raw = await req.text();if(raw.length>2048)return out({error:'Invalid request'},400);
  let body:any;try{body=JSON.parse(raw);}catch{body=null;}
  if (!body || typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) return out({ error: "This link is unavailable." }, 404);
  if (!["status", "respond"].includes(body.action) || (body.action === "respond" && typeof body.accept !== "boolean")) return out({ error: "Choose accept or decline." }, 400);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.token)))].map(x => x.toString(16).padStart(2, "0")).join("");
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data, error } = await db.rpc("service_lead_offer_link", { p_token_hash: hash, p_accept: body.action === "respond" ? body.accept : null });
    if (error) return out({ error: "Unable to confirm right now. Check the offer again before retrying." }, 503);
    if (!data) return out({ error: "This link is unavailable. Open EZfix or contact the office." }, 404);
    return out({ ok: true, offer: data });
  } catch {
    return out({ error: "Unable to connect. Check your connection and try again." }, 503);
  }
});
