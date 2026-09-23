import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TYPES = ["text.received", "text.sent", "text.delivered", "text.delivery_failed", "text.delivery_unconfirmed"];
const STOP_WORDS = new Set(["STOP", "END", "CANCEL", "UNSUBSCRIBE", "QUIT"]);
const rank: Record<string, number> = { queued: 0, sent: 1, delivery_unconfirmed: 2, delivered: 3, failed: 3 };

function normPhone(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  if (s.startsWith("+")) return "+" + d;
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d ? "+" + d : null;
}

function mapStatus(t: string, s: any) {
  if (t === "text.delivered") return "delivered";
  if (t === "text.delivery_failed") return "failed";
  if (t === "text.delivery_unconfirmed") return "delivery_unconfirmed";
  if (t === "text.sent") return "sent";
  return String(s || "sent").toLowerCase();
}

async function auth(req: Request) {
  const h = req.headers.get("Authorization") ?? "";
  if (!h.startsWith("Bearer ")) return null;
  const token = h.slice(7);
  const c = createClient(url, anon, { global: { headers: { Authorization: h } } });
  const { data, error } = await c.auth.getUser(token);
  if (error || !data.user) return null;
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: member } = await admin.from("team").select("id").eq("auth_user_id", data.user.id).eq("status", "active").maybeSingle();
  return member ? { admin, member } : null;
}

async function recordConsentKeyword(admin: any, remote: string | null, message: string | null, providerMessageId: string | null, eventAt: string) {
  if (!remote) return;
  const keyword = String(message || "").trim().toUpperCase();
  if (keyword !== "START" && !STOP_WORDS.has(keyword)) return;
  const optedIn = keyword === "START";
  const { error } = await admin.from("sms_consent").upsert({
    phone_e164: remote,
    status: optedIn ? "opted_in" : "opted_out",
    source: "inbound_keyword",
    evidence_message_id: providerMessageId,
    last_keyword: keyword,
    opted_in_at: optedIn ? eventAt : null,
    opted_out_at: optedIn ? null : eventAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "phone_e164" });
  if (error) throw error;
}

async function resolveParty(admin: any, remote: string | null) {
  let customerId = null, leadId = null, amb = false;
  if (remote) {
    const [{ data: cs }, { data: ls }] = await Promise.all([
      admin.from("customers").select("id,phone").is("deleted_at", null),
      admin.from("leads").select("id,phone").is("deleted_at", null),
    ]);
    const cm = (cs ?? []).filter((x: any) => normPhone(x.phone) === remote);
    const lm = (ls ?? []).filter((x: any) => normPhone(x.phone) === remote);
    if (cm.length === 1 && lm.length === 0) customerId = cm[0].id;
    else if (cm.length === 0 && lm.length === 1) leadId = lm[0].id;
    else if (cm.length > 0 || lm.length > 0) amb = true;
  }
  return { customerId, leadId, amb };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const ctx = await auth(req);
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: events, error } = await ctx.admin.from("inkbox_events").select("*").eq("processing_status", "unprocessed").in("event_type", TYPES).order("received_at", { ascending: true }).limit(100);
  if (error) return Response.json({ error: "Query failed" }, { status: 500 });

  let processed = 0, failed = 0;
  for (const e of events ?? []) {
    try {
      const peid = e.provider_event_id;
      const pmid = e.provider_message_id ?? null;
      const remote = normPhone(e.remote_phone_number);
      const eventAt = e.provider_created_at ?? e.received_at ?? new Date().toISOString();
      let existing: any = null;

      if (pmid) {
        const r = await ctx.admin.from("sms_messages").select("*").eq("provider_message_id", pmid).order("created_at", { ascending: true }).limit(1);
        existing = r.data?.[0] ?? null;
      }
      if (!existing) {
        const r = await ctx.admin.from("sms_messages").select("*").contains("provider_event_ids", [peid]).limit(1);
        existing = r.data?.[0] ?? null;
      }

      if (e.event_type === "text.received") {
        await recordConsentKeyword(ctx.admin, remote, e.message_text ?? null, pmid, eventAt);
        if (!existing) {
          const { customerId, leadId, amb } = await resolveParty(ctx.admin, remote);
          const row = {
            id: crypto.randomUUID(), provider: "inkbox", channel: "sms", provider_event_ids: [peid], provider_message_id: pmid,
            provider_conversation_id: e.provider_conversation_id ?? null, direction: "inbound", local_phone_number: e.local_phone_number ?? null,
            remote_phone_number: e.remote_phone_number ?? null, normalized_remote_phone: remote, message_text: e.message_text ?? null,
            message_type: e.message_type ?? "sms", provider_status: "received", customer_id: customerId, lead_id: leadId,
            match_ambiguous: amb, provider_created_at: e.provider_created_at ?? null, received_at: e.received_at ?? new Date().toISOString(),
          };
          const ins = await ctx.admin.from("sms_messages").insert(row);
          if (ins.error) throw ins.error;
        } else {
          const ids = Array.from(new Set([...(existing.provider_event_ids ?? []), peid]));
          const up = await ctx.admin.from("sms_messages").update({ provider_event_ids: ids }).eq("id", existing.id);
          if (up.error) throw up.error;
        }
      } else {
        const st = mapStatus(e.event_type, e.delivery_status);
        const rawText = e.raw_event?.data?.text_message ?? {};
        const failureReason = st === "failed" ? String(rawText?.failure_reason || rawText?.error || e.delivery_status || "delivery_failed") : null;

        if (!existing) {
          const { customerId, leadId, amb } = await resolveParty(ctx.admin, remote);
          const ins = await ctx.admin.from("sms_messages").insert({
            id: crypto.randomUUID(), provider: "inkbox", channel: "sms", provider_event_ids: [peid], provider_message_id: pmid,
            provider_conversation_id: e.provider_conversation_id ?? null, direction: e.direction ?? "outbound", local_phone_number: e.local_phone_number ?? null,
            remote_phone_number: e.remote_phone_number ?? null, normalized_remote_phone: remote, message_text: e.message_text ?? null,
            message_type: e.message_type ?? "sms", provider_status: st, customer_id: customerId, lead_id: leadId, match_ambiguous: amb,
            provider_created_at: e.provider_created_at ?? null,
            sent_at: ["sent", "delivery_unconfirmed", "delivered"].includes(st) ? eventAt : null,
            delivered_at: st === "delivered" ? eventAt : null,
            failed_at: st === "failed" ? eventAt : null,
            failure_reason: failureReason,
          });
          if (ins.error && ins.error.code !== "23505") throw ins.error;
        } else {
          const cur = existing.provider_status ?? "queued";
          const terminal = cur === "delivered" || cur === "failed";
          const ids = Array.from(new Set([...(existing.provider_event_ids ?? []), peid]));
          const patch: any = { provider_event_ids: ids };
          if (!terminal && (rank[st] ?? -1) >= (rank[cur] ?? -1)) patch.provider_status = st;
          if (["sent", "delivery_unconfirmed", "delivered"].includes(st) && !existing.sent_at) patch.sent_at = eventAt;
          if (st === "delivered" && !existing.delivered_at) patch.delivered_at = eventAt;
          if (st === "failed" && !existing.failed_at) { patch.failed_at = eventAt; patch.failure_reason = failureReason; }
          const up = await ctx.admin.from("sms_messages").update(patch).eq("id", existing.id);
          if (up.error) throw up.error;
        }
      }

      const ack = await ctx.admin.from("inkbox_events").update({ processing_status: "processed", processed_at: new Date().toISOString() }).eq("provider_event_id", peid).eq("processing_status", "unprocessed");
      if (ack.error) throw ack.error;
      processed++;
    } catch (err) {
      console.error("sync event failed", e.provider_event_id, err);
      failed++;
    }
  }
  return Response.json({ ok: true, processed, failed });
});
