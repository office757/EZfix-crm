import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

const CRM_URL = "https://ezfix-crm-sms-length-fixed.vercel.app";
const FROM = "EZfix Garage Doors Inc <office@ezfixgaragedoorsinc.com>";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ezfix-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const sha256 = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

async function activeOwner(admin: any, authHeader: string) {
  if (!authHeader.startsWith("Bearer ")) return null;
  const scoped = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await scoped.auth.getUser(authHeader.slice(7));
  if (!user) return null;
  const { data: member } = await admin.from("team")
    .select("id,email,role,status")
    .eq("auth_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  return member && String(member.role || "").toLowerCase() === "owner" ? member : null;
}

async function verifyCronToken(admin: any, supplied: string) {
  if (!supplied) return false;
  const { data: config } = await admin.from("integration_alert_config")
    .select("token_hash")
    .eq("id", "main")
    .maybeSingle();
  if (!config?.token_hash) return false;
  return (await sha256(supplied)) === String(config.token_hash);
}

function safeCount(rows: unknown[] | null | undefined) {
  return Array.isArray(rows) ? rows.length : 0;
}

function digestHtml(counts: Record<string, number>, total: number, periodStart: string, periodEnd: string) {
  const row = (label: string, count: number, path: string) =>
    `<tr><td style="padding:9px 0;border-bottom:1px solid #eee">${label}</td><td style="padding:9px 0;border-bottom:1px solid #eee;text-align:right"><b>${count}</b></td><td style="padding:9px 0 9px 14px;border-bottom:1px solid #eee"><a href="${CRM_URL}/#/${path}" style="color:#d95f02;text-decoration:none">Open CRM</a></td></tr>`;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f7f7f7;margin:0;padding:24px;color:#181818">
  <div style="max-width:620px;margin:auto;background:#fff;border-radius:14px;padding:24px">
    <h2 style="margin:0 0 8px">EZfix CRM Integration Alert</h2>
    <p style="margin:0 0 20px;color:#666">${total} new production issue${total===1?"":"s"} detected.</p>
    <table style="width:100%;border-collapse:collapse">
      ${row("WhatsApp failure / setup block", counts.whatsapp, "team")}
      ${row("SMS provider failure", counts.sms, "communications")}
      ${row("Call needs review", counts.calls, "receptionist")}
      ${row("High-priority task", counts.tasks, "followups")}
      ${row("Square webhook error", counts.square, "invoices")}
    </table>
    <p style="font-size:12px;color:#777;margin:18px 0 0">Window: ${periodStart} → ${periodEnd}. No customer names, phone numbers, email addresses, or message contents are included in this alert.</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authHeader = req.headers.get("authorization") || "";
  const cronToken = req.headers.get("x-ezfix-cron-token") || "";
  const [owner, cronAuthorized] = await Promise.all([
    activeOwner(admin, authHeader),
    verifyCronToken(admin, cronToken),
  ]);
  if (!owner && !cronAuthorized) return json({ ok: false, error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || (cronAuthorized ? "run" : "preview")).toLowerCase();
  if (!["preview", "run"].includes(action)) return json({ ok: false, error: "unsupported_action" }, 400);
  if (action === "run" && !cronAuthorized && !owner) return json({ ok: false, error: "forbidden" }, 403);

  const { data: config, error: configError } = await admin.from("integration_alert_config")
    .select("*").eq("id", "main").maybeSingle();
  if (configError || !config) return json({ ok: false, error: "alert_config_unavailable" }, 503);
  if (config.enabled === false) return json({ ok: true, status: "disabled" });

  const periodStart = String(config.last_checked_at || config.started_at);
  const periodEnd = new Date().toISOString();

  const [wa, sms, calls, tasks, square] = await Promise.all([
    admin.from("wa_notifications").select("id,status,updated_at")
      .gt("updated_at", periodStart).lte("updated_at", periodEnd)
      .in("status", ["failed", "not_configured", "blocked_no_opt_in"]),
    admin.from("sms_messages").select("id,provider_status,updated_at")
      .gt("updated_at", periodStart).lte("updated_at", periodEnd)
      .eq("provider_status", "failed"),
    admin.from("calls").select("id,lead_extraction_status,created_at")
      .gt("created_at", periodStart).lte("created_at", periodEnd)
      .in("lead_extraction_status", ["ambiguous_identity", "needs_review"]),
    admin.from("tasks").select("id,priority,status,updated_at")
      .gt("updated_at", periodStart).lte("updated_at", periodEnd)
      .eq("priority", "high").in("status", ["open", "in_progress"]),
    admin.from("square_webhook_events").select("event_id,status,error_text,updated_at")
      .gt("updated_at", periodStart).lte("updated_at", periodEnd)
      .not("error_text", "is", null),
  ]);

  const queryErrors = [wa.error, sms.error, calls.error, tasks.error, square.error].filter(Boolean);
  if (queryErrors.length) {
    console.error("integration alert query failed", queryErrors);
    return json({ ok: false, error: "alert_query_failed" }, 500);
  }

  const counts = {
    whatsapp: safeCount(wa.data),
    sms: safeCount(sms.data),
    calls: safeCount(calls.data),
    tasks: safeCount(tasks.data),
    square: safeCount(square.data),
  };
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  if (action === "preview") {
    return json({ ok: true, status: "preview", period_start: periodStart, period_end: periodEnd, counts, total });
  }

  if (total === 0) {
    await admin.from("integration_alert_config").update({
      last_checked_at: periodEnd,
      updated_at: periodEnd,
    }).eq("id", "main");
    return json({ ok: true, status: "no_new_issues", counts, total: 0 });
  }

  const keys = [
    ...(wa.data || []).map((x: any) => `wa:${x.id}:${x.status}:${x.updated_at}`),
    ...(sms.data || []).map((x: any) => `sms:${x.id}:${x.provider_status}:${x.updated_at}`),
    ...(calls.data || []).map((x: any) => `call:${x.id}:${x.lead_extraction_status}:${x.created_at}`),
    ...(tasks.data || []).map((x: any) => `task:${x.id}:${x.status}:${x.updated_at}`),
    ...(square.data || []).map((x: any) => `square:${x.event_id}:${x.status}:${x.updated_at}`),
  ].sort();
  const digestHash = await sha256(JSON.stringify(keys));
  const idempotencyKey = `ezfix-integration-digest-${digestHash.slice(0, 40)}`;

  let { data: digest } = await admin.from("integration_alert_digests")
    .select("*").eq("digest_hash", digestHash).maybeSingle();

  if (digest?.status === "sent") {
    await admin.from("integration_alert_config").update({
      last_checked_at: periodEnd,
      updated_at: periodEnd,
    }).eq("id", "main");
    return json({ ok: true, status: "already_sent", digest_hash: digestHash, total });
  }

  if (Number(digest?.attempt_count || 0) >= 3) {
    await admin.from("integration_alert_digests").update({
      status: "abandoned",
      error_text: "Maximum alert delivery attempts reached",
      updated_at: periodEnd,
    }).eq("digest_hash", digestHash);
    await admin.from("integration_alert_config").update({
      last_checked_at: periodEnd,
      updated_at: periodEnd,
    }).eq("id", "main");
    return json({ ok: false, status: "abandoned", digest_hash: digestHash, total }, 503);
  }

  if (!digest) {
    const inserted = await admin.from("integration_alert_digests").insert({
      period_start: periodStart,
      period_end: periodEnd,
      digest_hash: digestHash,
      counts,
      status: "pending",
      attempt_count: 0,
    }).select("*").single();
    if (inserted.error) return json({ ok: false, error: "digest_claim_failed" }, 500);
    digest = inserted.data;
  }

  const attemptCount = Number(digest.attempt_count || 0) + 1;
  await admin.from("integration_alert_digests").update({
    status: "sending",
    attempt_count: attemptCount,
    updated_at: periodEnd,
    error_text: null,
  }).eq("id", digest.id);

  const { data: ownerRow } = await admin.from("team")
    .select("email").eq("status", "active").ilike("role", "owner")
    .not("email", "is", null).limit(1).maybeSingle();
  const ownerEmail = String(ownerRow?.email || "").trim();
  if (!ownerEmail.includes("@")) {
    await admin.from("integration_alert_digests").update({
      status: "failed", error_text: "Active Owner email is not configured", updated_at: new Date().toISOString(),
    }).eq("id", digest.id);
    return json({ ok: false, error: "owner_email_missing" }, 503);
  }
  if (!RESEND_API_KEY) {
    await admin.from("integration_alert_digests").update({
      status: "failed", error_text: "RESEND_API_KEY is not configured", updated_at: new Date().toISOString(),
    }).eq("id", digest.id);
    return json({ ok: false, error: "resend_not_configured" }, 503);
  }

  const subject = `[EZfix CRM] Integration alert — ${total} new issue${total===1?"":"s"}`;
  const html = digestHtml(counts, total, periodStart, periodEnd);
  const textBody = [
    `EZfix CRM detected ${total} new production issue(s).`,
    `WhatsApp: ${counts.whatsapp}`,
    `SMS failures: ${counts.sms}`,
    `Calls needing review: ${counts.calls}`,
    `High-priority tasks: ${counts.tasks}`,
    `Square webhook errors: ${counts.square}`,
    `Open CRM: ${CRM_URL}`,
    `Window: ${periodStart} -> ${periodEnd}`,
  ].join("\n");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from: FROM, to: [ownerEmail], subject, html, text: textBody }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const reason = String(result?.message || result?.error || `Resend HTTP ${response.status}`).slice(0, 1000);
      await admin.from("integration_alert_digests").update({
        status: "failed", error_text: reason, updated_at: new Date().toISOString(),
      }).eq("id", digest.id);
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        await admin.from("integration_alert_config").update({
          last_checked_at: periodEnd, updated_at: new Date().toISOString(),
        }).eq("id", "main");
      }
      return json({ ok: false, status: "provider_rejected", error: reason, attempt_count: attemptCount }, 502);
    }

    const providerMessageId = result?.id ? String(result.id) : null;
    await admin.from("integration_alert_digests").update({
      status: "sent",
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_text: null,
    }).eq("id", digest.id);
    await admin.from("integration_alert_config").update({
      last_checked_at: periodEnd,
      last_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", "main");

    return json({ ok: true, status: "sent", total, counts, provider_message_id: providerMessageId, digest_hash: digestHash });
  } catch (e: any) {
    const reason = String(e?.name === "AbortError" ? "Resend request timed out; outcome unknown" : e?.message || e).slice(0, 1000);
    await admin.from("integration_alert_digests").update({
      status: "provider_outcome_unknown",
      error_text: reason,
      updated_at: new Date().toISOString(),
    }).eq("id", digest.id);
    return json({
      ok: false,
      status: "provider_outcome_unknown",
      retry_safe_with_same_idempotency_key: true,
      attempt_count: attemptCount,
      digest_hash: digestHash,
    }, 502);
  }
});
