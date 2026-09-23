import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyWebhook, Inkbox } from "npm:@inkbox/sdk";

const TYPES = new Set(["text.received", "text.sent", "text.delivered", "text.delivery_failed", "text.delivery_unconfirmed", "phone.incoming_call", "call.ended"]);
const url = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const signing = Deno.env.get("INKBOX_SIGNING_KEY")!;
const key = Deno.env.get("INKBOX_API_KEY")!;
const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const IDENTITY = "ashley-ezfixgaragedoorsinc";
const STOP_WORDS = new Set(["STOP", "END", "CANCEL", "UNSUBSCRIBE", "QUIT"]);
const rank: Record<string, number> = { queued: 0, sent: 1, delivery_unconfirmed: 2, delivered: 3, failed: 3 };

const norm = (v: any) => {
  const s = String(v ?? "").trim();
  const d = s.replace(/\D/g, "");
  if (!d) return null;
  if (s.startsWith("+")) return "+" + d;
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  return "+" + d;
};

const LEGACY_TAG = "[EZFIX_CRM_GUARDRAILS_V2]";
const BEGIN_TAG = "[EZFIX_CRM_GUARDRAILS_BEGIN]";
const END_TAG = "[EZFIX_CRM_GUARDRAILS_END]";
const VERSION_TAG = "[EZFIX_CRM_GUARDRAILS_V3]";
const legacyTail = "- Never claim a payment, booking, technician assignment, or transfer succeeded unless the connected system actually confirms it.";
function stripManagedGuardrails(current: string) {
  let s = String(current || "");
  const b = s.indexOf(BEGIN_TAG), e = s.indexOf(END_TAG);
  if (b >= 0 && e >= b) s = (s.slice(0, b) + s.slice(e + END_TAG.length)).trim();
  const l = s.indexOf(LEGACY_TAG);
  if (l >= 0) {
    const tail = s.indexOf(legacyTail, l);
    s = tail >= 0 ? (s.slice(0, l) + s.slice(tail + legacyTail.length)).trim() : s.slice(0, l).trim();
  }
  return s.trim();
}
function guardrailBlock(transfer: string) {
  return `${BEGIN_TAG}\n${VERSION_TAG}\n- You are Ashley, the virtual receptionist for EZfix Garage Doors Inc. Be concise, friendly, and professional.\n- Your primary goal is to collect the caller's name, callback number, service address or city, garage-door problem, and preferred service date/time when possible, then preserve those details for EZfix follow-up. The inbound caller ID may be used as the callback number; never invent missing details.\n- Do not ask a caller to choose, guess, state, or confirm a payment amount merely to create, arrange, or schedule a repair or service visit. If the caller asks to schedule a payment, separate that request from appointment intake: collect the service details and explain that any payment amount must come from an existing CRM estimate or invoice.\n- Only discuss a specific payment amount when it is already tied to an existing estimate or invoice supplied by the business system. Never invent, negotiate, or quote a price that the business system has not provided.\n- Treat requested appointment dates and time windows as preferences unless real scheduling availability has been confirmed. If availability has not been checked, say EZfix will confirm the requested window.\n- Do not promise or state that an appointment is booked, scheduled, confirmed, reserved, or assigned unless the scheduling system has actually confirmed it.\n- Do not assign, name, or promise a technician unless the CRM explicitly returns a confirmed technician assignment. A caller's technician preference is not an assignment.\n- If the caller asks for a human, owner, manager, or representative, attempt a live transfer to ${transfer} only if the phone platform exposes a live-transfer capability. If live transfer is unavailable or fails, clearly say a human follow-up is needed, preserve the callback number, and do not claim that a transfer occurred.\n- Never claim a payment, booking, technician assignment, message delivery, or transfer succeeded unless the connected system actually confirms it.\n${END_TAG}`;
}
async function ensureHostedAgentGuardrails() {
  if (!key) return false;
  const { data: settings } = await db.from("settings").select("ai_receptionist").eq("id", "main").maybeSingle();
  const transfer = String(settings?.ai_receptionist?.humanTransferNumber || "+17742445533");
  const block = guardrailBlock(transfer);
  const ink = await new Inkbox({ apiKey: key }).ready();
  const identity = await ink.getIdentity(IDENTITY);
  const cfg: any = await identity.getHostedAgentConfig();
  const current = String(cfg?.instructions || "");
  const existingStart = current.indexOf(BEGIN_TAG), existingEnd = current.indexOf(END_TAG);
  if (existingStart >= 0 && existingEnd >= existingStart) {
    const existing = current.slice(existingStart, existingEnd + END_TAG.length).trim();
    if (existing === block) return false;
  }
  const base = stripManagedGuardrails(current);
  const instructions = (base ? base + "\n\n" : "") + block;
  await identity.setHostedAgentConfig({ voice: cfg?.voice ?? undefined, instructions });
  return true;
}

async function recordConsentKeyword(remote: string | null, message: string | null, providerMessageId: string | null, eventAt: string) {
  if (!remote) return;
  const keyword = String(message || "").trim().toUpperCase();
  if (keyword !== "START" && !STOP_WORDS.has(keyword)) return;
  const optedIn = keyword === "START";
  const row: any = {
    phone_e164: remote,
    status: optedIn ? "opted_in" : "opted_out",
    source: "inbound_keyword",
    evidence_message_id: providerMessageId,
    last_keyword: keyword,
    opted_in_at: optedIn ? eventAt : null,
    opted_out_at: optedIn ? null : eventAt,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("sms_consent").upsert(row, { onConflict: "phone_e164" });
  if (error) throw error;
}

async function resolveParty(remote: string | null) {
  let customerId: string | null = null;
  let leadId: string | null = null;
  let ambiguous = false;
  if (remote) {
    const [{ data: cs }, { data: ls }] = await Promise.all([
      db.from("customers").select("id,phone").is("deleted_at", null),
      db.from("leads").select("id,phone").is("deleted_at", null),
    ]);
    const cm = (cs ?? []).filter((x: any) => norm(x.phone) === remote);
    const lm = (ls ?? []).filter((x: any) => norm(x.phone) === remote);
    if (cm.length === 1) customerId = cm[0].id;
    else if (cm.length > 1) ambiguous = true;
    else if (lm.length === 1) leadId = lm[0].id;
    else if (lm.length > 1) ambiguous = true;
  }
  return { customerId, leadId, ambiguous };
}

function eventStatus(type: string) {
  if (type === "text.delivered") return "delivered";
  if (type === "text.delivery_failed") return "failed";
  if (type === "text.delivery_unconfirmed") return "delivery_unconfirmed";
  if (type === "text.sent") return "sent";
  return "queued";
}

async function processSms(e: any) {
  const peid = e.provider_event_id;
  const pmid = e.provider_message_id ?? null;
  const remote = norm(e.remote_phone_number);
  const eventAt = e.provider_created_at ?? e.received_at ?? new Date().toISOString();
  let existing: any = null;

  if (pmid) {
    const r = await db.from("sms_messages").select("*").eq("provider_message_id", pmid).order("created_at", { ascending: true }).limit(1);
    existing = r.data?.[0] ?? null;
  }
  if (!existing) {
    const r = await db.from("sms_messages").select("*").contains("provider_event_ids", [peid]).limit(1);
    existing = r.data?.[0] ?? null;
  }

  if (e.event_type === "text.received") {
    await recordConsentKeyword(remote, e.message_text ?? null, pmid, eventAt);
    if (!existing) {
      const { customerId, leadId, ambiguous } = await resolveParty(remote);
      const x = await db.from("sms_messages").insert({
        id: crypto.randomUUID(), provider: "inkbox", channel: "sms", provider_event_ids: [peid], provider_message_id: pmid,
        provider_conversation_id: e.provider_conversation_id ?? null, direction: "inbound", local_phone_number: e.local_phone_number ?? null,
        remote_phone_number: e.remote_phone_number ?? null, normalized_remote_phone: remote, message_text: e.message_text ?? null,
        message_type: e.message_type ?? "sms", provider_status: "received", customer_id: customerId, lead_id: leadId,
        match_ambiguous: ambiguous, provider_created_at: e.provider_created_at ?? null, received_at: e.received_at ?? new Date().toISOString(),
      });
      if (x.error) throw x.error;
    } else {
      const ids = [...new Set([...(existing.provider_event_ids ?? []), peid])];
      const x = await db.from("sms_messages").update({ provider_event_ids: ids }).eq("id", existing.id);
      if (x.error) throw x.error;
    }
    return;
  }

  if (!e.event_type.startsWith("text.")) return;
  const st = eventStatus(e.event_type);
  const rawText = e.raw_event?.data?.text_message ?? {};
  const failureReason = st === "failed" ? String(rawText?.failure_reason || rawText?.error || e.delivery_status || "delivery_failed") : null;

  if (!existing) {
    const { customerId, leadId, ambiguous } = await resolveParty(remote);
    const x = await db.from("sms_messages").insert({
      id: crypto.randomUUID(), provider: "inkbox", channel: "sms", provider_event_ids: [peid], provider_message_id: pmid,
      provider_conversation_id: e.provider_conversation_id ?? null, direction: e.direction ?? "outbound", local_phone_number: e.local_phone_number ?? null,
      remote_phone_number: e.remote_phone_number ?? null, normalized_remote_phone: remote, message_text: e.message_text ?? null,
      message_type: e.message_type ?? "sms", provider_status: st, customer_id: customerId, lead_id: leadId, match_ambiguous: ambiguous,
      provider_created_at: e.provider_created_at ?? null,
      sent_at: st === "sent" || st === "delivered" || st === "delivery_unconfirmed" ? eventAt : null,
      delivered_at: st === "delivered" ? eventAt : null, failed_at: st === "failed" ? eventAt : null, failure_reason: failureReason,
    });
    if (x.error && x.error.code !== "23505") throw x.error;
    return;
  }

  const ids = [...new Set([...(existing.provider_event_ids ?? []), peid])];
  const patch: any = { provider_event_ids: ids };
  const cur = existing.provider_status ?? "queued";
  if (cur !== "delivered" && cur !== "failed" && (rank[st] ?? -1) >= (rank[cur] ?? -1)) patch.provider_status = st;
  if ((st === "sent" || st === "delivery_unconfirmed" || st === "delivered") && !existing.sent_at) patch.sent_at = eventAt;
  if (st === "delivered" && !existing.delivered_at) patch.delivered_at = eventAt;
  if (st === "failed" && !existing.failed_at) { patch.failed_at = eventAt; patch.failure_reason = failureReason; }
  const x = await db.from("sms_messages").update(patch).eq("id", existing.id);
  if (x.error) throw x.error;
}

async function processEnded(event: any) {
  if (!key) throw new Error("Inkbox API not configured");
  const cd = event?.data?.call ?? event?.data?.phone_call ?? event?.data ?? {};
  const callId = String(cd?.id || cd?.call_id || "").trim();
  if (!callId) return;
  const ink = await new Inkbox({ apiKey: key }).ready();
  const identity = await ink.getIdentity(IDENTITY);
  const calls: any[] = await identity.listCalls({ limit: 50, offset: 0 });
  const c = calls.find((x: any) => String(x.id) === callId) || cd;
  let segs: any[] = [];
  try { segs = await identity.listTranscripts(callId); } catch {}
  const transcript = segs.map((s: any) => ({ party: s.party || null, text: s.text || "", createdAt: s.createdAt || s.created_at || null }));
  const started = c.startedAt || c.started_at || null;
  const ended = c.endedAt || c.ended_at || new Date().toISOString();
  const dur = started && ended ? Math.max(0, Math.round((new Date(ended).getTime() - new Date(started).getTime()) / 1000)) : null;
  const summary = transcript.map((x: any) => `${x.party || "speaker"}: ${x.text}`).join("\n").slice(0, 2000) || (c.reason || null);
  const providerFields: any = {
    provider_call_id: callId, mode: c.mode || "inkbox", summary, duration_sec: dur, transcript,
    direction: c.direction || null, remote_number: c.remotePhoneNumber || c.remote_phone_number || null,
    local_number: c.localPhoneNumber || c.local_phone_number || null, status: c.status || "ended", started_at: started, ended_at: ended,
    recording_url: c.recordingUrl || c.recording_url || c.audioUrl || c.audio_url || null, provider_data: c,
  };
  const { data: existing } = await db.from("calls").select("id,outcome").eq("provider_call_id", callId).maybeSingle();
  const x = existing ? await db.from("calls").update(providerFields).eq("id", existing.id) : await db.from("calls").insert({ id: `inkbox_${callId}`, ...providerFields, created_at: started || new Date().toISOString() });
  if (x.error) throw x.error;
}

Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const raw = await req.text();
  const headers: any = {};
  for (const [k, v] of req.headers.entries()) headers[k] = v;
  const sig = req.headers.get("x-inkbox-signature");
  const rid = req.headers.get("x-inkbox-request-id");
  const ts = req.headers.get("x-inkbox-timestamp");
  if (!sig || !rid || !ts) return new Response("Missing required headers", { status: 401 });
  let ok = false;
  try { ok = verifyWebhook({ payload: raw, headers, secret: signing }); } catch { return new Response("Signature verification error", { status: 401 }); }
  if (!ok) return new Response("Invalid signature", { status: 401 });
  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const id = typeof event?.id === "string" ? event.id.trim() : "";
  const type = typeof event?.event_type === "string" ? event.event_type.trim() : "";
  if (!id || !type) return new Response("Missing event id/type", { status: 400 });
  if (!TYPES.has(type)) return new Response("Ignored", { status: 200 });
  if (type === "phone.incoming_call" || type === "call.ended") {
    try { await ensureHostedAgentGuardrails(); } catch (err) { console.error("hosted agent guardrail sync failed", err); }
  }
  const tm = event?.data?.text_message ?? null;
  const row: any = {
    provider: "inkbox", provider_event_id: id, event_type: type,
    provider_message_id: typeof tm?.id === "string" ? tm.id : null, provider_conversation_id: typeof tm?.conversation_id === "string" ? tm.conversation_id : null,
    direction: typeof tm?.direction === "string" ? tm.direction : null, local_phone_number: typeof tm?.local_phone_number === "string" ? tm.local_phone_number : null,
    remote_phone_number: typeof tm?.remote_phone_number === "string" ? tm.remote_phone_number : null, message_text: typeof tm?.text === "string" ? tm.text : null,
    message_type: typeof tm?.type === "string" ? tm.type : null, delivery_status: typeof tm?.delivery_status === "string" ? tm.delivery_status : null,
    provider_created_at: typeof tm?.created_at === "string" ? tm.created_at : null, processing_status: "unprocessed", raw_event: event,
  };
  const ins = await db.from("inkbox_events").insert(row);
  if (ins.error && ins.error.code !== "23505") { console.error(ins.error); return new Response("Storage error", { status: 500 }); }
  try {
    if (type.startsWith("text.")) {
      const { data: stored } = await db.from("inkbox_events").select("*").eq("provider_event_id", id).single();
      if (stored) await processSms(stored);
    } else if (type === "call.ended") {
      await processEnded(event);
    }
    await db.from("inkbox_events").update({ processing_status: "processed", processed_at: new Date().toISOString() }).eq("provider_event_id", id);
  } catch (err) {
    console.error("inline processing failed", err);
    return new Response("Stored; processing pending", { status: 200 });
  }
  return new Response("OK", { status: 200 });
});