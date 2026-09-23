import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const text = (v: any) => String(v ?? "").trim();
const lower = (v: any) => text(v).toLowerCase();
const num = (v: any) => Number(v) || 0;
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function recompute(draft: any) {
  const items = Array.isArray(draft?.items) ? draft.items : [];
  if (!items.length || items.length > 20) throw new Error("Draft must contain 1-20 line items");
  let subtotal = 0;
  let taxable = 0;
  for (const item of items) {
    const qty = num(item?.qty);
    const rate = num(item?.rate);
    if (!(qty > 0) || qty > 1000 || rate < 0 || rate > 1000000) throw new Error("Invalid draft line item");
    const line = qty * rate;
    subtotal += line;
    if (item?.taxable !== false) taxable += line;
  }
  const taxRate = Math.max(0, Math.min(25, num(draft?.totals?.tax_rate ?? draft?.tax_rate)));
  const subtotalRounded = round2(subtotal);
  const tax = round2(taxable * taxRate / 100);
  const total = round2(subtotalRounded + tax);
  return { subtotal: subtotalRounded, tax_rate: taxRate, tax, total };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);

    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const db = createClient(URL, SERVICE);
    const { data: member } = await db.from("team")
      .select("id,name,role,status")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!member || lower(member.status) !== "active") return json({ ok: false, error: "Forbidden" }, 403);
    const role = lower(member.role);
    if (!["owner", "admin", "office", "dispatcher", "technician"].includes(role)) {
      return json({ ok: false, error: "Role not permitted" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const draft = body?.draft;
    if (!draft || draft?.draft_only !== true || draft?.needs_approval !== true) {
      return json({ ok: false, error: "Only an approval-required AI draft can be submitted" }, 400);
    }
    const jobId = text(body?.job_id || draft?.job?.id);
    if (role === "technician" && !jobId) {
      return json({ ok: false, error: "Technician approval requests require an assigned job" }, 400);
    }

    let job: any = null;
    if (jobId) {
      const { data, error } = await db.from("jobs")
        .select("id,customer_id,customer_name,technician_id,technician,title,status,deleted_at")
        .eq("id", jobId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ ok: false, error: "Job not found" }, 404);
      job = data;
      if (role === "technician" && String(job.technician_id || "") !== String(member.id)) {
        return json({ ok: false, error: "Technician may submit drafts only for an assigned job" }, 403);
      }
      if (draft?.job?.id && String(draft.job.id) !== String(job.id)) {
        return json({ ok: false, error: "Draft job context does not match approval request" }, 400);
      }
    }

    const recomputed = recompute(draft);
    const declaredTotal = num(draft?.totals?.total);
    const targetTotal = num(draft?.target_total);
    if (Math.abs(recomputed.total - declaredTotal) >= 0.01 || Math.abs(recomputed.total - targetTotal) >= 0.01) {
      return json({ ok: false, error: "Draft totals failed server-side reconciliation" }, 400);
    }

    const productIds = [...new Set((draft.items || []).map((x: any) => text(x?.catalog_product_id)).filter(Boolean))];
    if (productIds.length) {
      const { data: products, error } = await db.from("products").select("id,active").in("id", productIds);
      if (error) throw error;
      const active = new Set((products || []).filter((x: any) => x.active !== false).map((x: any) => String(x.id)));
      if (productIds.some((id: string) => !active.has(id))) {
        return json({ ok: false, error: "Draft contains an inactive or unknown catalog item" }, 400);
      }
    }

    const proposedValue = {
      ...draft,
      totals: recomputed,
      job: job ? {
        id: job.id,
        customer_id: job.customer_id,
        customer_name: job.customer_name,
        title: job.title,
        status: job.status,
      } : null,
      requested_by: { team_id: member.id, name: member.name, role },
      submitted_at: new Date().toISOString(),
      approval_only: true,
    };

    const { data: approval, error: approvalError } = await db.from("ai_approvals")
      .insert({
        domain: "invoices",
        action: "create_service_document",
        reason: `AI service document draft submitted by ${member.name || member.id}`,
        current_value: null,
        proposed_value: proposedValue,
        evidence: [{
          source: "ai-technician-assistant",
          request: text(draft?.request),
          reconciled_total: recomputed.total,
          job_id: job?.id || null,
        }],
        risk_level: "medium",
        status: "pending",
      })
      .select("id,created_at,status,domain,action,risk_level")
      .single();
    if (approvalError) throw approvalError;

    try {
      await db.from("ai_command_log").insert({
        user_id: user.id,
        command: text(draft?.request),
        classified_intent: "submit_service_document_for_approval",
        action_type: "approval_requested",
        result: { approval_id: approval.id, job_id: job?.id || null, total: recomputed.total },
        status: "completed",
      });
    } catch {}

    return json({ ok: true, approval, persisted_financial_document: false });
  } catch (error: any) {
    console.error("ai-service-document-approval", error);
    return json({ ok: false, error: error?.message || "Approval request failed" }, 500);
  }
});
