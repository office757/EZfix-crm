import { Inkbox } from "npm:@inkbox/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const IDENTITY = "ashley-ezfixgaragedoorsinc";
const LOCAL_PHONE = "+14139613223";
const MAX = 1500;
const E164 = /^\+[1-9]\d{6,14}$/;
const FAILED_STATUSES = new Set(["failed", "delivery_failed", "rejected", "undelivered"]);

const apiKey = Deno.env.get("INKBOX_API_KEY")!;
const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const inkbox = new Inkbox({ apiKey });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "content-type": "application/json" },
});
const digits10 = (p: string) => p.replace(/\D/g, "").slice(-10);
const normalizeE164 = (p: string) => {
  const raw = String(p || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && digits.length >= 7 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
};
const hex = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, "0")).join("");

async function resolveParty(admin: any, remote: string) {
  const digits = digits10(remote);
  let customerId: string | null = null;
  let leadId: string | null = null;
  let ambiguous = false;
  try {
    const [{ data: cs }, { data: ls }] = await Promise.all([
      admin.from("customers").select("id,phone").is("deleted_at", null),
      admin.from("leads").select("id,phone").is("deleted_at", null),
    ]);
    const cm = (cs || []).filter((x: any) => digits10(x.phone || "") === digits);
    const lm = (ls || []).filter((x: any) => digits10(x.phone || "") === digits);
    if (cm.length === 1 && lm.length === 0) customerId = cm[0].id;
    else if (cm.length === 0 && lm.length === 1) leadId = lm[0].id;
    else if (cm.length > 0 || lm.length > 0) ambiguous = true;
  } catch (e) {
    console.error("sms recipient linkage lookup failed", e);
  }
  return { customerId, leadId, ambiguous };
}

async function persistExplicitRejection(admin: any, to: string, message: string, providerCode: string, providerMessage: string) {
  const now = new Date().toISOString();
  const { customerId, leadId, ambiguous } = await resolveParty(admin, to);
  const smsId = "sms_" + crypto.randomUUID();
  const reason = `${providerCode}: ${providerMessage}`.slice(0, 1500);
  const { error } = await admin.from("sms_messages").insert({
    id: smsId,
    provider: "inkbox",
    channel: "sms",
    provider_event_ids: [],
    provider_message_id: null,
    provider_conversation_id: null,
    direction: "outbound",
    local_phone_number: LOCAL_PHONE,
    remote_phone_number: to,
    normalized_remote_phone: to,
    message_text: message,
    message_type: "sms",
    provider_status: "failed",
    customer_id: customerId,
    lead_id: leadId,
    match_ambiguous: ambiguous,
    provider_created_at: now,
    sent_at: null,
    delivered_at: null,
    failed_at: now,
    failure_reason: reason,
  });
  if (error) {
    console.error("explicit SMS rejection persistence failed", error);
    return { recorded: false, smsId: null };
  }
  return { recorded: true, smsId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = auth.slice(7);
  const authClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: u } = await authClient.auth.getUser(token);
  if (!u.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: member } = await admin.from("team").select("id,role").eq("auth_user_id", u.user.id).eq("status", "active").maybeSingle();
  if (!member) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => null);
  const to = normalizeE164(String(body?.to || "").trim());
  const message = String(body?.message || "").trim();
  const approvalId = String(body?.approval_id || "").trim();
  if (!message || message.length > MAX) return json({ error: "Invalid message." }, 400);
  if (!E164.test(to)) return json({ error: "A valid E.164 phone number is required.", code: "SMS_INVALID_RECIPIENT" }, 400);

  const { data: consent, error: consentError } = await admin.from("sms_consent").select("status,source,last_keyword,opted_in_at,opted_out_at").eq("phone_e164", to).maybeSingle();
  if (consentError) return json({ success: false, error: "Unable to verify SMS opt-in state.", code: "SMS_CONSENT_LOOKUP_FAILED" }, 503);
  if (!consent || consent.status !== "opted_in") {
    const optedOut = consent?.status === "opted_out";
    return json({
      success: false,
      accepted: false,
      delivered: false,
      retrySafe: true,
      code: optedOut ? "SMS_OPTED_OUT" : "SMS_OPT_IN_REQUIRED",
      status: optedOut ? "opted_out" : "opt_in_required",
      error: optedOut ? "SMS blocked because this recipient opted out." : "SMS blocked until this recipient opts in.",
      recipient: to,
      optInInstruction: `Have the recipient text START to ${LOCAL_PHONE} from the phone that should receive SMS, then retry.`,
    }, 409);
  }

  const directOwner = String(member.role || "").toLowerCase() === "owner";
  if (!approvalId && !directOwner) return json({ error: "Owner permission or approved communication required." }, 403);

  let claimToken: string | null = null;
  if (approvalId) {
    const contentHash = await hex(JSON.stringify({ channel: "sms", recipient: to, message }));
    const { data: a } = await admin.from("outbound_communication_approvals").select("id,channel,recipient,content_hash,status,sent_at").eq("id", approvalId).maybeSingle();
    if (!a || a.channel !== "sms" || a.status !== "approved" || a.sent_at) return json({ error: "Approval invalid, not approved, or already used." }, 403);
    if (normalizeE164(a.recipient) !== to || a.content_hash !== contentHash) return json({ error: "Approved content does not match request." }, 409);
    claimToken = crypto.randomUUID();
    const claimTime = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin.from("outbound_communication_approvals").update({ status: "sending", claimed_at: claimTime, claim_token: claimToken, last_error: null }).eq("id", approvalId).eq("status", "approved").is("sent_at", null).is("claim_token", null).select("id").maybeSingle();
    if (claimError || !claimed) return json({ error: "Approval already claimed or no longer sendable." }, 409);
  }

  try {
    const identity = await inkbox.getIdentity(IDENTITY);
    const sent: any = await identity.sendText({ to, text: message });
    const remote = normalizeE164(String(sent.remotePhoneNumber || to).trim() || to);
    const now = new Date().toISOString();
    const providerStatus = String(sent.deliveryStatus || "queued").toLowerCase();
    const failedImmediately = FAILED_STATUSES.has(providerStatus);
    const { customerId, leadId, ambiguous } = await resolveParty(admin, remote);

    const smsId = "sms_" + crypto.randomUUID();
    const failureReason = failedImmediately ? String(sent.failureReason || sent.error || providerStatus) : null;
    const row = {
      id: smsId,
      provider: "inkbox",
      channel: "sms",
      provider_event_ids: [],
      provider_message_id: sent.id ?? null,
      provider_conversation_id: sent.conversationId ?? null,
      direction: "outbound",
      local_phone_number: LOCAL_PHONE,
      remote_phone_number: remote,
      normalized_remote_phone: remote,
      message_text: message,
      message_type: sent.type ?? "sms",
      provider_status: failedImmediately ? "failed" : providerStatus,
      customer_id: customerId,
      lead_id: leadId,
      match_ambiguous: ambiguous,
      provider_created_at: sent.createdAt ?? now,
      sent_at: failedImmediately ? null : now,
      delivered_at: providerStatus === "delivered" ? now : null,
      failed_at: failedImmediately ? now : null,
      failure_reason: failureReason,
    };
    const { error: persistError } = await admin.from("sms_messages").insert(row);
    if (persistError) {
      if (approvalId && claimToken) await admin.from("outbound_communication_approvals").update({ status: "sending", last_error: "SMS accepted by provider but CRM persistence failed; do not retry automatically" }).eq("id", approvalId).eq("status", "sending").eq("claim_token", claimToken);
      return json({ success: false, accepted: true, delivered: false, error: "SMS accepted but CRM persistence failed; do not retry automatically", code: "SMS_PERSISTENCE_FAILED", providerMessageId: sent.id ?? null }, 500);
    }

    if (failedImmediately) {
      if (approvalId && claimToken) await admin.from("outbound_communication_approvals").update({ status: "approved", claimed_at: null, claim_token: null, last_error: failureReason || "Provider reported delivery failure" }).eq("id", approvalId).eq("status", "sending").eq("claim_token", claimToken).is("sent_at", null);
      return json({ success: false, accepted: false, delivered: false, retrySafe: true, error: failureReason || "Provider reported delivery failure.", code: "SMS_PROVIDER_REJECTED", smsId, providerMessageId: sent.id ?? null, status: "failed" }, 502);
    }

    if (approvalId && claimToken) {
      const { data: marked, error: markError } = await admin.from("outbound_communication_approvals").update({ status: "sent", sent_at: now, provider_message_id: sent.id ?? null, last_error: null }).eq("id", approvalId).eq("status", "sending").eq("claim_token", claimToken).is("sent_at", null).select("id").maybeSingle();
      if (markError || !marked) return json({ success: false, accepted: true, delivered: providerStatus === "delivered", error: "SMS accepted but approval finalization failed; do not retry automatically", code: "SMS_APPROVAL_FINALIZE_FAILED", providerMessageId: sent.id ?? null }, 500);
    }

    return json({ success: true, accepted: true, delivered: providerStatus === "delivered", smsId, providerMessageId: sent.id ?? null, providerConversationId: sent.conversationId ?? null, status: providerStatus, approvalId: approvalId || null, directOwner: !approvalId });
  } catch (e: any) {
    const status = Number(e?.status || e?.statusCode || 502);
    const providerCode = String(e?.detail?.error || e?.code || e?.errorCode || e?.name || "INKBOX_ERROR");
    const providerMessage = String(e?.detail?.message || e?.message || "SMS submission failed.");
    const explicitReject = status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);
    let rejectionRecorded = false;
    let rejectedSmsId: string | null = null;
    if (explicitReject) {
      const recorded = await persistExplicitRejection(admin, to, message, providerCode, providerMessage);
      rejectionRecorded = recorded.recorded;
      rejectedSmsId = recorded.smsId;
      if (approvalId && claimToken) await admin.from("outbound_communication_approvals").update({ status: "approved", claimed_at: null, claim_token: null, last_error: `${providerCode}: ${providerMessage}`.slice(0, 500) }).eq("id", approvalId).eq("status", "sending").eq("claim_token", claimToken).is("sent_at", null);
    } else {
      if (approvalId && claimToken) await admin.from("outbound_communication_approvals").update({ last_error: `Provider outcome unknown (${providerCode}): ${providerMessage}`.slice(0, 500) }).eq("id", approvalId).eq("status", "sending").eq("claim_token", claimToken).is("sent_at", null);
    }
    console.error("send-inkbox-sms failed", { status, providerCode, providerMessage, explicitReject, rejectionRecorded });
    return json({ success: false, accepted: false, delivered: false, error: providerMessage, providerCode, code: explicitReject ? "SMS_PROVIDER_REJECTED" : "SMS_PROVIDER_OUTCOME_UNKNOWN", retrySafe: explicitReject, approvalStatus: explicitReject ? "approved" : "sending", rejectionRecorded, smsId: rejectedSmsId }, status >= 400 && status < 600 ? status : 502);
  }
});