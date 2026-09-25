import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const cleanE164 = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = "+" + raw.replace(/\D/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
};
const serverPatch = async (admin: any, id: string, currentAppData: any, patch: Record<string, unknown>) => {
  const appPatch: Record<string, unknown> = {};
  for (const key of ["status", "failure_reason", "provider_message_id", "recipient_phone"]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) appPatch[key] = patch[key];
  }
  const app_data = { ...(currentAppData || {}), ...appPatch };
  const { error } = await admin.from("wa_notifications").update({ ...patch, app_data }).eq("id", id);
  if (error) throw error;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const scoped = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await scoped.auth.getUser(auth.slice(7));
  if (!userData.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(url, service);
  const { data: member, error: memberError } = await admin.from("team").select("id,role,status").eq("auth_user_id", userData.user.id).eq("status", "active").maybeSingle();
  if (memberError || !member) return json({ error: "forbidden" }, 403);
  if (!["owner", "admin", "dispatcher"].includes(String(member.role || "").toLowerCase())) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => null);
  const action = String(body?.action || "send").trim().toLowerCase();
  const token = Deno.env.get("META_WHATSAPP_TOKEN") || "";
  const phoneNumberId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") || "";
  const graphVersion = Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "";
  const templateName = Deno.env.get("META_WHATSAPP_ASSIGNMENT_TEMPLATE_NAME") || "";
  const templateLanguage = Deno.env.get("META_WHATSAPP_TEMPLATE_LANGUAGE") || "en_US";
  const missingConfig = [
    !token ? "META_WHATSAPP_TOKEN" : null,
    !phoneNumberId ? "META_WHATSAPP_PHONE_NUMBER_ID" : null,
    !graphVersion ? "META_WHATSAPP_GRAPH_VERSION" : null,
    !templateName ? "META_WHATSAPP_ASSIGNMENT_TEMPLATE_NAME" : null,
  ].filter(Boolean);

  if (action === "status") {
    return json({
      ok: true,
      provider: "meta_cloud_api",
      configured: missingConfig.length === 0,
      missing: missingConfig,
      template_language: templateLanguage,
    });
  }
  if (action !== "send") return json({ error: "unsupported_action" }, 400);

  const notificationId = String(body?.notification_id || body?.notificationId || "").trim();
  if (!notificationId) return json({ error: "notification_id_required" }, 400);

  const { data: notification, error: notificationError } = await admin.from("wa_notifications").select("*").eq("id", notificationId).maybeSingle();
  if (notificationError) return json({ error: "notification_lookup_failed" }, 500);
  if (!notification) return json({ error: "notification_not_found" }, 404);
  if (["accepted", "sent", "delivered", "read"].includes(notification.status)) return json({ success: true, status: notification.status, providerMessageId: notification.provider_message_id || null, duplicateSafe: true });

  let recipientTeamId = notification.recipient_team_id as string | null;
  if (!recipientTeamId) {
    const legacyName = String(notification.app_data?.technician_name || "").trim();
    if (legacyName) {
      const { data: matches } = await admin.from("team").select("id").ilike("name", legacyName).eq("status", "active").limit(2);
      if (matches?.length === 1) recipientTeamId = matches[0].id;
    }
  }
  if (!recipientTeamId) {
    await serverPatch(admin, notificationId, notification.app_data, { status: "failed", failure_reason: "Recipient technician could not be resolved", failed_at: new Date().toISOString() });
    return json({ error: "recipient_not_resolved" }, 409);
  }

  const { data: tech, error: techError } = await admin.from("team").select("id,name,phone,status,app_data").eq("id", recipientTeamId).maybeSingle();
  if (techError || !tech || tech.status !== "active") {
    await serverPatch(admin, notificationId, notification.app_data, { status: "failed", failure_reason: "Recipient technician is unavailable", failed_at: new Date().toISOString() });
    return json({ error: "recipient_unavailable" }, 409);
  }

  const techData = tech.app_data || {};
  const eventKey = String(notification.kind || notification.app_data?.event_type || "").trim();
  const prefs = techData.notify_prefs && typeof techData.notify_prefs === "object" ? techData.notify_prefs : {};
  if (eventKey && prefs[eventKey] === false) {
    await serverPatch(admin, notificationId, notification.app_data, { status: "suppressed", failure_reason: "Technician disabled this WhatsApp notification type" });
    return json({ success: false, status: "suppressed" }, 200);
  }

  if (techData.whatsapp_opt_in !== true) {
    await serverPatch(admin, notificationId, notification.app_data, { status: "blocked_no_opt_in", failure_reason: "WhatsApp assignment alerts require explicit technician opt-in" });
    return json({ success: false, status: "blocked_no_opt_in" }, 200);
  }
  const recipient = cleanE164(techData.whatsapp_number);
  if (!recipient) {
    await serverPatch(admin, notificationId, notification.app_data, { status: "failed", failure_reason: "Technician WhatsApp number is missing or invalid", failed_at: new Date().toISOString() });
    return json({ error: "invalid_recipient" }, 409);
  }

  if (missingConfig.length) {
    await serverPatch(admin, notificationId, notification.app_data, { status: "not_configured", recipient_phone: recipient, failure_reason: "Meta WhatsApp Business Platform credentials/template are not configured" });
    return json({ success: false, status: "not_configured", missing: missingConfig }, 200);
  }

  const message = String(notification.message || notification.app_data?.message || "New EZfix assignment").slice(0, 1024);
  const attemptCount = Number(notification.attempt_count || 0) + 1;
  await serverPatch(admin, notificationId, notification.app_data, { status: "queued", recipient_team_id: recipientTeamId, recipient_phone: recipient, failure_reason: null, attempt_count: attemptCount });

  const payload = {
    messaging_product: "whatsapp",
    to: recipient.replace(/^\+/, ""),
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: [{ type: "body", parameters: [{ type: "text", text: message }] }],
    },
  };

  try {
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = String(result?.error?.message || `Meta API HTTP ${response.status}`).slice(0, 1000);
      await serverPatch(admin, notificationId, notification.app_data, { status: "failed", failure_reason: reason, failed_at: new Date().toISOString() });
      return json({ success: false, status: "failed", error: reason }, 502);
    }
    const providerMessageId = result?.messages?.[0]?.id ? String(result.messages[0].id) : null;
    if (!providerMessageId) {
      await serverPatch(admin, notificationId, notification.app_data, { status: "failed", failure_reason: "Meta accepted the request without returning a message id; do not retry automatically", failed_at: new Date().toISOString() });
      return json({ success: false, status: "failed", error: "provider_outcome_uncertain", retrySafe: false }, 502);
    }
    await serverPatch(admin, notificationId, notification.app_data, { status: "accepted", provider: "meta_cloud_api", provider_message_id: providerMessageId, recipient_team_id: recipientTeamId, recipient_phone: recipient, accepted_at: new Date().toISOString(), failure_reason: null });
    return json({ success: true, status: "accepted", providerMessageId });
  } catch (_e) {
    await serverPatch(admin, notificationId, notification.app_data, { status: "failed", failure_reason: "Meta API outcome unknown; do not retry automatically", failed_at: new Date().toISOString() });
    return json({ success: false, status: "failed", error: "provider_outcome_unknown", retrySafe: false }, 502);
  }
});