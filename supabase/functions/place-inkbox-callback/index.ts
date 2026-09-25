import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Inkbox, CallMode, CallOrigin, OnVoicemail } from "npm:@inkbox/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INKBOX_API_KEY = Deno.env.get("INKBOX_API_KEY") || "";
const IDENTITY = "ashley-ezfixgaragedoorsinc";
const TRANSFER = "+17742445533";
const CONSENT_ATTESTATION =
  "Customer explicitly requested or consented to an AI-assisted service callback from EZfix Garage Doors Inc at this number.";
const SOURCES = new Set(["customer_request", "recorded_call", "signed_form"]);

const text = (v: unknown) => String(v ?? "").trim();
const normalizeE164 = (v: unknown) => {
  const raw = text(v);
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return "+" + digits;
  return null;
};
const inCallingWindow = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value || -1);
  return hour >= 9 && hour < 19;
};

async function getOwner(auth: string) {
  const scoped = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await scoped.auth.getUser();
  if (!user) return null;
  const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: member } = await db.from("team")
    .select("id,name,role,status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!member || text(member.role).toLowerCase() !== "owner" || text(member.status).toLowerCase() !== "active") return null;
  return { member, db };
}

async function getEntity(db: any, entityType: string, entityId: string) {
  if (!["customers", "leads"].includes(entityType)) return null;
  const select = entityType === "customers"
    ? "id,name,phone,deleted_at"
    : "id,name,phone,service_requested,deleted_at";
  const { data } = await db.from(entityType)
    .select(select)
    .eq("id", entityId)
    .is("deleted_at", null)
    .maybeSingle();
  return data || null;
}

async function providerStatus() {
  if (!INKBOX_API_KEY) return { configured: false, dedicated_number: false, reason: "INKBOX_API_KEY missing" };
  try {
    const ink = await new Inkbox({ apiKey: INKBOX_API_KEY }).ready();
    const identity = await ink.getIdentity(IDENTITY);
    return {
      configured: true,
      dedicated_number: !!identity.phoneNumber?.number,
      phone_last4: identity.phoneNumber?.number ? identity.phoneNumber.number.replace(/\D/g, "").slice(-4) : null,
    };
  } catch (e: any) {
    return { configured: false, dedicated_number: false, reason: text(e?.message || e).slice(0, 300) };
  }
}

async function activeAuthorization(db: any, entityType: string, entityId: string, phone: string) {
  const { data } = await db.from("voice_callback_authorizations")
    .select("id,entity_type,entity_id,phone_e164,consent_source,evidence_reference,consented_at,expires_at,created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("phone_e164", phone)
    .is("revoked_at", null)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);

  const owner = await getOwner(auth);
  if (!owner) return json({ ok: false, error: "Owner access required" }, 403);
  const { member, db } = owner;

  try {
    const body = await req.json().catch(() => ({}));
    const action = text(body?.action || "status").toLowerCase();
    const entityType = text(body?.entity_type);
    const entityId = text(body?.entity_id);
    if (!entityType || !entityId) return json({ ok: false, error: "entity_type and entity_id are required" }, 400);

    const entity: any = await getEntity(db, entityType, entityId);
    if (!entity) return json({ ok: false, error: "Customer or lead not found" }, 404);
    const phone = normalizeE164(entity.phone);
    if (!phone) return json({ ok: false, error: "Entity does not have a valid callback number" }, 409);

    if (action === "status") {
      const [authorization, provider] = await Promise.all([
        activeAuthorization(db, entityType, entityId, phone),
        providerStatus(),
      ]);
      return json({
        ok: true,
        entity: { type: entityType, id: entity.id, name: entity.name, phone_last4: phone.slice(-4) },
        authorization,
        provider,
        calling_window_open: inCallingWindow(),
        can_place: !!authorization && provider.configured && provider.dedicated_number && inCallingWindow(),
      });
    }

    if (action === "authorize") {
      if (body?.confirmed !== true) return json({ ok: false, error: "Explicit owner confirmation is required" }, 400);
      const source = text(body?.consent_source);
      const evidence = text(body?.evidence_reference).slice(0, 1000);
      if (!SOURCES.has(source)) return json({ ok: false, error: "Unsupported consent source" }, 400);
      if (evidence.length < 5) return json({ ok: false, error: "Evidence reference is required" }, 400);

      const consentedAt = new Date(text(body?.consented_at || new Date().toISOString()));
      if (!Number.isFinite(consentedAt.getTime()) || consentedAt.getTime() > Date.now() + 60_000 || consentedAt.getTime() < Date.now() - 30 * 86400_000) {
        return json({ ok: false, error: "consented_at must be within the past 30 days" }, 400);
      }
      const hours = Math.min(720, Math.max(1, Number(body?.expires_in_hours || 168)));
      const expiresAt = new Date(Math.min(
        consentedAt.getTime() + hours * 3600_000,
        consentedAt.getTime() + 30 * 86400_000,
      ));

      await db.from("voice_callback_authorizations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("phone_e164", phone)
        .is("revoked_at", null)
        .is("used_at", null);

      const { data: authorization, error } = await db.from("voice_callback_authorizations").insert({
        entity_type: entityType,
        entity_id: entityId,
        phone_e164: phone,
        purpose: "service_callback",
        consent_text: CONSENT_ATTESTATION,
        consent_source: source,
        evidence_reference: evidence,
        consented_at: consentedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        created_by_team_id: member.id,
      }).select("id,consent_source,evidence_reference,consented_at,expires_at").single();
      if (error) throw error;

      await db.from("audit_log").insert({
        id: crypto.randomUUID(),
        action: "voice_callback_authorized",
        summary: `Voice callback authorized for ${entity.name || entityId}`,
        entity_type: entityType,
        entity_id: entityId,
        source: "owner",
        created_by_team_id: member.id,
        read: false,
      });
      return json({ ok: true, authorization });
    }

    if (action === "revoke") {
      const { error } = await db.from("voice_callback_authorizations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("phone_e164", phone)
        .is("revoked_at", null)
        .is("used_at", null);
      if (error) throw error;
      return json({ ok: true, revoked: true });
    }

    if (action !== "place") return json({ ok: false, error: "Unsupported action" }, 400);
    if (body?.confirm_call !== true || text(body?.confirmation_phrase) !== "CALL NOW") {
      return json({ ok: false, error: "Live call requires explicit CALL NOW confirmation" }, 400);
    }
    if (!inCallingWindow()) return json({ ok: false, error: "AI callbacks are limited to 9:00 AM–7:00 PM Eastern" }, 409);

    const authorization: any = await activeAuthorization(db, entityType, entityId, phone);
    if (!authorization) return json({ ok: false, error: "A current unused voice callback authorization is required" }, 409);
    const provider = await providerStatus();
    if (!provider.configured || !provider.dedicated_number) {
      return json({ ok: false, error: "Inkbox dedicated outbound line is not ready", provider }, 409);
    }

    const usedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await db.from("voice_callback_authorizations")
      .update({ used_at: usedAt, attempt_status: "submitting", attempt_error: null })
      .eq("id", authorization.id)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", usedAt)
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) return json({ ok: false, error: "Callback authorization was already consumed or expired" }, 409);

    const serviceContext = entityType === "leads" && text(entity.service_requested)
      ? ` Existing service request: ${text(entity.service_requested).slice(0, 240)}.`
      : "";
    const reason =
      `Service callback requested by ${entity.name || "the customer"}. ` +
      "Begin by clearly identifying yourself as Ashley, an AI assistant calling on behalf of EZfix Garage Doors Inc about their garage door service request. " +
      "Collect or confirm service details and scheduling preferences only. Do not make a sales pitch, invent or negotiate prices, or claim a booking/technician assignment unless the CRM confirms it. " +
      `If they ask for a person, offer human follow-up at ${TRANSFER}.` + serviceContext;

    try {
      const ink = await new Inkbox({ apiKey: INKBOX_API_KEY }).ready();
      const identity = await ink.getIdentity(IDENTITY);
      const call: any = await identity.placeCall({
        toNumber: phone,
        origination: CallOrigin.DEDICATED_NUMBER,
        mode: CallMode.HOSTED_AGENT,
        onVoicemail: OnVoicemail.HANG_UP,
        reason,
      });
      const providerCallId = text(call?.id || call?.callId || "");
      await db.from("voice_callback_authorizations")
        .update({ provider_call_id: providerCallId || null, attempt_status: "accepted" })
        .eq("id", authorization.id);
      await db.from("audit_log").insert({
        id: crypto.randomUUID(),
        action: "voice_callback_submitted",
        summary: `AI service callback submitted for ${entity.name || entityId}`,
        entity_type: entityType,
        entity_id: entityId,
        related_type: "inkbox_call",
        related_id: providerCallId || null,
        source: "owner",
        created_by_team_id: member.id,
        read: false,
      });
      return json({ ok: true, accepted: true, provider_call_id: providerCallId || null, authorization_consumed: true });
    } catch (e: any) {
      const message = text(e?.message || e).slice(0, 1000) || "Provider call submission failed";
      await db.from("voice_callback_authorizations")
        .update({ attempt_status: "provider_error", attempt_error: message })
        .eq("id", authorization.id);
      return json({
        ok: false,
        accepted: false,
        authorization_consumed: true,
        retry_safe: false,
        error: "Provider call outcome failed or is uncertain; create a new authorization before another attempt",
        provider_error: message,
      }, 502);
    }
  } catch (e: any) {
    console.error("place-inkbox-callback", e);
    return json({ ok: false, error: text(e?.message || e) || "Voice callback action failed" }, 500);
  }
});
