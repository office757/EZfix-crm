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
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_DOCUMENT_TYPES = new Set(["invoice_draft", "estimate_draft", "receipt_draft"]);

type CatalogProduct = {
  id: string;
  name: string | null;
  category: string | null;
  category_id: string | null;
  rate: number | string | null;
  taxable: boolean | null;
  active: boolean | null;
};

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
    if (item?.taxable === true) taxable += line;
    else if (item?.taxable !== false) throw new Error("Draft line taxable classification must be boolean");
  }
  const rawTaxRate = Number(draft?.totals?.tax_rate ?? draft?.tax_rate);
  if (!Number.isFinite(rawTaxRate) || rawTaxRate < 0 || rawTaxRate > 25) {
    throw new Error("Invalid draft tax rate");
  }
  const subtotalRounded = round2(subtotal);
  const tax = round2(taxable * rawTaxRate / 100);
  const total = round2(subtotalRounded + tax);
  return { subtotal: subtotalRounded, tax_rate: rawTaxRate, tax, total };
}

function canonicalizeCatalogItems(items: any[], products: CatalogProduct[]) {
  const byId = new Map(products.map((product) => [String(product.id), product]));
  return items.map((item, index) => {
    const productId = text(item?.catalog_product_id);
    if (!productId) throw new Error(`Draft line ${index + 1} is missing catalog_product_id`);
    const product = byId.get(productId);
    if (!product || product.active !== true) {
      throw new Error(`Draft line ${index + 1} references an inactive or unknown catalog item`);
    }

    const canonicalName = text(product.name);
    const canonicalCategory = text(product.category) || text(product.category_id);
    const catalogRateRaw = Number(product.rate);
    if (!canonicalName) throw new Error(`Catalog item ${productId} is missing a name`);
    if (!canonicalCategory) throw new Error(`Catalog item ${productId} is missing a category`);
    if (typeof product.taxable !== "boolean") throw new Error(`Catalog item ${productId} has an invalid taxable classification`);
    if (!Number.isFinite(catalogRateRaw) || catalogRateRaw <= 0 || catalogRateRaw > 1000000) {
      throw new Error(`Catalog item ${productId} has a missing or invalid rate`);
    }

    const qty = Number(item?.qty);
    const draftRateRaw = Number(item?.rate);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1000) throw new Error(`Draft line ${index + 1} has an invalid quantity`);
    if (!Number.isFinite(draftRateRaw) || draftRateRaw < 0 || draftRateRaw > 1000000) throw new Error(`Draft line ${index + 1} has an invalid rate`);
    const catalogRate = round2(catalogRateRaw);
    const draftRate = round2(draftRateRaw);
    if (Math.abs(catalogRate - draftRate) >= 0.01) {
      throw new Error(`Draft line ${index + 1} rate does not match the active catalog; regenerate the draft`);
    }

    if (text(item?.name) !== canonicalName) {
      throw new Error(`Draft line ${index + 1} name does not match the active catalog; regenerate the draft`);
    }
    if (text(item?.category) !== canonicalCategory) {
      throw new Error(`Draft line ${index + 1} category does not match the active catalog; regenerate the draft`);
    }
    if (typeof item?.taxable !== "boolean" || item.taxable !== product.taxable) {
      throw new Error(`Draft line ${index + 1} taxable classification does not match the active catalog; regenerate the draft`);
    }

    return {
      ...item,
      catalog_product_id: productId,
      name: canonicalName,
      category: canonicalCategory,
      qty,
      rate: catalogRate,
      taxable: product.taxable,
    };
  });
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
    const documentType = text(draft?.document_type);
    if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
      return json({ ok: false, error: "Unsupported AI service document type" }, 400);
    }
    const targetTotal = Number(draft?.target_total);
    if (!Number.isFinite(targetTotal) || targetTotal <= 0 || targetTotal > 1000000) {
      return json({ ok: false, error: "Draft target_total must be a positive amount no greater than 1000000" }, 400);
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

    const rawItems = Array.isArray(draft?.items) ? draft.items : [];
    if (!rawItems.length || rawItems.length > 20) {
      return json({ ok: false, error: "Draft must contain 1-20 line items" }, 400);
    }
    const productIds = [...new Set(rawItems.map((item: any) => text(item?.catalog_product_id)).filter(Boolean))];
    if (productIds.length === 0 || rawItems.some((item: any) => !text(item?.catalog_product_id))) {
      return json({ ok: false, error: "Every draft line must reference an active catalog item" }, 400);
    }

    const { data: products, error: productsError } = await db.from("products")
      .select("id,name,category,category_id,rate,taxable,active")
      .in("id", productIds);
    if (productsError) throw productsError;

    let canonicalItems: any[];
    try {
      canonicalItems = canonicalizeCatalogItems(rawItems, (products || []) as CatalogProduct[]);
    } catch (catalogError: any) {
      return json({ ok: false, error: catalogError?.message || "Draft catalog validation failed" }, 409);
    }

    const canonicalDraft = { ...draft, document_type: documentType, items: canonicalItems };
    let recomputed;
    try {
      recomputed = recompute(canonicalDraft);
    } catch (validationError: any) {
      return json({ ok: false, error: validationError?.message || "Draft validation failed" }, 400);
    }
    const declaredTotal = Number(draft?.totals?.total);
    if (!Number.isFinite(declaredTotal)) {
      return json({ ok: false, error: "Draft declared total is invalid" }, 400);
    }
    const recomputedCents = Math.round(recomputed.total * 100);
    const declaredCents = Math.round(declaredTotal * 100);
    const targetCents = Math.round(targetTotal * 100);
    if (recomputedCents !== declaredCents) {
      return json({ ok: false, error: "Draft totals failed server-side reconciliation" }, 400);
    }
    if (recomputedCents !== targetCents) {
      return json({ ok: false, error: "Requested total does not match verified Product Catalog pricing", catalog_total: recomputed.total, requested_total: round2(targetTotal) }, 409);
    }
    if (draft?.catalog_pricing_complete === false || draft?.target_matches_catalog === false || draft?.reconciled === false) {
      return json({ ok: false, error: "Draft is explicitly marked as requiring pricing review and cannot be approved yet" }, 409);
    }

    const proposedValue = {
      ...draft,
      document_type: documentType,
      items: canonicalItems,
      totals: recomputed,
      target_total: round2(targetTotal),
      pricing_source: "active_product_catalog",
      pricing_verified: true,
      catalog_integrity_verified: true,
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
          pricing_source: "active_product_catalog",
          pricing_verified: true,
          catalog_integrity_verified: true,
          catalog_product_ids: productIds,
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
        result: {
          approval_id: approval.id,
          job_id: job?.id || null,
          total: recomputed.total,
          pricing_verified: true,
          catalog_integrity_verified: true,
        },
        status: "completed",
      });
    } catch {}

    return json({ ok: true, approval, persisted_financial_document: false, pricing_verified: true, catalog_integrity_verified: true });
  } catch (error: any) {
    console.error("ai-service-document-approval", error);
    return json({ ok: false, error: error?.message || "Approval request failed" }, 500);
  }
});
