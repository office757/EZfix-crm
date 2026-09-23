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
const ALLOWED_DOCUMENT_TYPES = new Set(["invoice_draft", "estimate_draft", "receipt_draft"]);

function recompute(draft: any) {
  const items = Array.isArray(draft?.items) ? draft.items : [];
  if (!items.length || items.length > 20) throw new Error("Draft must contain 1-20 line items");
  let subtotal = 0;
  let taxable = 0;
  for (const item of items) {
    const qty = Number(item?.qty);
    const rate = Number(item?.rate);
    if (!Number.isFinite(qty) || !Number.isFinite(rate) || !(qty > 0) || qty > 1000 || rate < 0 || rate > 1000000) {
      throw new Error("Invalid draft line item");
    }
    const line = qty * rate;
    subtotal += line;
    if (item?.taxable !== false) taxable += line;
  }
  const taxRate = Number(draft?.totals?.tax_rate ?? draft?.tax_rate);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 25) throw new Error("Invalid draft tax rate");
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
    const { data: member } = await db.from("team").select("id,name,role,status").eq("auth_user_id", user.id).maybeSingle();
    if (!member || lower(member.status) !== "active") return json({ ok: false, error: "Forbidden" }, 403);
    const role = lower(member.role);
    if (!["owner", "admin", "office", "dispatcher", "technician"].includes(role)) return json({ ok: false, error: "Role not permitted" }, 403);

    const body = await req.json().catch(() => ({}));
    const draft = body?.draft;
    if (!draft || draft?.draft_only !== true || draft?.needs_approval !== true) return json({ ok: false, error: "Only an approval-required AI draft can be submitted" }, 400);
    const documentType = text(draft?.document_type);
    if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) return json({ ok: false, error: "Unsupported AI service document type" }, 400);
    const jobId = text(body?.job_id || draft?.job?.id);
    if (role === "technician" && !jobId) return json({ ok: false, error: "Technician approval requests require an assigned job" }, 400);

    let job: any = null;
    if (jobId) {
      const { data, error } = await db.from("jobs").select("id,customer_id,customer_name,technician_id,technician,title,status,deleted_at").eq("id", jobId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!data) return json({ ok: false, error: "Job not found" }, 404);
      job = data;
      if (role === "technician" && String(job.technician_id || "") !== String(member.id)) return json({ ok: false, error: "Technician may submit drafts only for an assigned job" }, 403);
      if (draft?.job?.id && String(draft.job.id) !== String(job.id)) return json({ ok: false, error: "Draft job context does not match approval request" }, 400);
    }

    const items = Array.isArray(draft.items) ? draft.items : [];
    if (!items.length || items.length > 20) return json({ ok: false, error: "Draft must contain 1-20 line items" }, 400);
    if (items.some((item: any) => !text(item?.catalog_product_id))) {
      return json({ ok: false, error: "Every draft line item must reference exactly one active catalog product" }, 400);
    }
    const productIds = [...new Set(items.map((x: any) => text(x?.catalog_product_id)))];

    const { data: products, error: productsError } = await db.from("products")
      .select("id,name,category,category_id,rate,taxable,active")
      .in("id", productIds);
    if (productsError) throw productsError;
    const productMap = new Map((products || []).map((p: any) => [String(p.id), p]));
    if (productMap.size !== productIds.length) return json({ ok: false, error: "Draft contains an unknown catalog item" }, 400);

    const pricingIssues: any[] = [];
    const verifiedItems = items.map((item: any) => {
      const id = text(item?.catalog_product_id);
      const product: any = productMap.get(id);
      if (!product || product.active !== true) {
        pricingIssues.push({ product_id: id, issue: "inactive_or_unknown" });
        return item;
      }

      const canonicalName = text(product.name);
      const canonicalCategory = text(product.category) || text(product.category_id);
      if (!canonicalName) pricingIssues.push({ product_id: id, issue: "catalog_name_missing" });
      if (!canonicalCategory) pricingIssues.push({ product_id: id, product_name: canonicalName || null, issue: "catalog_category_missing" });
      if (typeof product.taxable !== "boolean") pricingIssues.push({ product_id: id, product_name: canonicalName || null, issue: "catalog_taxable_invalid" });

      const catalogRateNumber = Number(product.rate);
      const draftRateNumber = Number(item.rate);
      const qtyNumber = Number(item.qty);
      if (!Number.isFinite(catalogRateNumber) || !(catalogRateNumber > 0) || catalogRateNumber > 1000000) {
        pricingIssues.push({ product_id: id, product_name: canonicalName || product.name, issue: "catalog_rate_missing_or_zero" });
      }
      if (!Number.isFinite(draftRateNumber) || draftRateNumber < 0 || draftRateNumber > 1000000) {
        pricingIssues.push({ product_id: id, product_name: canonicalName || product.name, issue: "draft_rate_invalid" });
      }
      if (!Number.isFinite(qtyNumber) || !(qtyNumber > 0) || qtyNumber > 1000) {
        pricingIssues.push({ product_id: id, product_name: canonicalName || product.name, issue: "draft_quantity_invalid" });
      }

      const catalogRate = round2(catalogRateNumber);
      const draftRate = round2(draftRateNumber);
      if (Number.isFinite(catalogRateNumber) && Number.isFinite(draftRateNumber) && Math.abs(catalogRate - draftRate) >= 0.01) {
        pricingIssues.push({ product_id: id, product_name: canonicalName || product.name, issue: "draft_rate_differs_from_catalog", catalog_rate: catalogRate, draft_rate: draftRate });
      }
      if (typeof product.taxable === "boolean") {
        if (typeof item?.taxable !== "boolean") {
          pricingIssues.push({ product_id: id, product_name: canonicalName || product.name, issue: "draft_taxable_missing" });
        } else if (product.taxable !== item.taxable) {
          pricingIssues.push({ product_id: id, product_name: canonicalName || product.name, issue: "taxable_flag_differs_from_catalog", catalog_taxable: product.taxable, draft_taxable: item.taxable });
        }
      }
      if (text(item?.name) && canonicalName && text(item.name) !== canonicalName) {
        pricingIssues.push({ product_id: id, product_name: canonicalName, issue: "draft_name_differs_from_catalog", draft_name: text(item.name) });
      }
      if (text(item?.category) && canonicalCategory && text(item.category) !== canonicalCategory) {
        pricingIssues.push({ product_id: id, product_name: canonicalName || product.name, issue: "draft_category_differs_from_catalog", catalog_category: canonicalCategory, draft_category: text(item.category) });
      }

      return {
        ...item,
        catalog_product_id: id,
        name: canonicalName || text(item?.name),
        category: canonicalCategory || text(item?.category),
        taxable: typeof product.taxable === "boolean" ? product.taxable : item?.taxable,
        qty: qtyNumber,
        rate: draftRateNumber,
      };
    });
    if (pricingIssues.length) return json({ ok: false, error: "Draft pricing failed catalog verification", pricing_issues: pricingIssues }, 409);

    let recomputed;
    try {
      recomputed = recompute({ ...draft, document_type: documentType, items: verifiedItems });
    } catch (validationError: any) {
      return json({ ok: false, error: validationError?.message || "Draft validation failed" }, 400);
    }
    const declaredTotal = Number(draft?.totals?.total);
    const targetTotal = Number(draft?.target_total);
    if (!Number.isFinite(declaredTotal)) return json({ ok: false, error: "Draft declared total is invalid" }, 400);
    if (!Number.isFinite(targetTotal) || !(targetTotal > 0) || targetTotal > 1000000) return json({ ok: false, error: "A positive requested total no greater than 1000000 is required" }, 400);
    if (Math.abs(recomputed.total - declaredTotal) >= 0.01) return json({ ok: false, error: "Draft totals failed server-side reconciliation" }, 400);
    if (Math.abs(recomputed.total - targetTotal) >= 0.01) {
      return json({ ok: false, error: "Requested total does not match verified Product Catalog pricing", catalog_total: recomputed.total, requested_total: round2(targetTotal) }, 409);
    }
    if (draft?.catalog_pricing_complete === false || draft?.target_matches_catalog === false || draft?.reconciled === false) {
      return json({ ok: false, error: "Draft is explicitly marked as requiring pricing review and cannot be approved yet" }, 409);
    }

    const proposedValue = {
      ...draft,
      document_type: documentType,
      items: verifiedItems,
      totals: recomputed,
      pricing_source: "active_product_catalog",
      pricing_verified: true,
      catalog_identity_verified: true,
      job: job ? { id: job.id, customer_id: job.customer_id, customer_name: job.customer_name, title: job.title, status: job.status } : null,
      requested_by: { team_id: member.id, name: member.name, role },
      submitted_at: new Date().toISOString(),
      approval_only: true,
    };

    const { data: approval, error: approvalError } = await db.from("ai_approvals").insert({
      domain: "invoices",
      action: "create_service_document",
      reason: `AI service document draft submitted by ${member.name || member.id}`,
      current_value: null,
      proposed_value: proposedValue,
      evidence: [{ source: "ai-technician-assistant", request: text(draft?.request), reconciled_total: recomputed.total, job_id: job?.id || null, pricing_source: "active_product_catalog", pricing_verified: true, catalog_identity_verified: true }],
      risk_level: "medium",
      status: "pending",
    }).select("id,created_at,status,domain,action,risk_level").single();
    if (approvalError) throw approvalError;

    try {
      await db.from("ai_command_log").insert({ user_id: user.id, command: text(draft?.request), classified_intent: "submit_service_document_for_approval", action_type: "approval_requested", result: { approval_id: approval.id, job_id: job?.id || null, total: recomputed.total, pricing_verified: true, catalog_identity_verified: true }, status: "completed" });
    } catch {}

    return json({ ok: true, approval, persisted_financial_document: false, pricing_verified: true, catalog_identity_verified: true });
  } catch (error: any) {
    console.error("ai-service-document-approval", error);
    return json({ ok: false, error: error?.message || "Approval request failed" }, 500);
  }
});
