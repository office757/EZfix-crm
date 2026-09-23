import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: any) => Number(value) || 0;
const text = (value: any) => String(value ?? "").trim();
const lower = (value: any) => text(value).toLowerCase();
const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function parseMoney(request: string, explicit: any) {
  const supplied = Number(explicit);
  if (Number.isFinite(supplied) && supplied > 0) return round2(supplied);
  const patterns = [
    /[$₪]\s*([0-9][0-9,]*(?:\.\d{1,2})?)/,
    /\b([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:dollars?|total|including\s+tax|incl\.?\s*tax)\b/i,
    /(?:סה["״']?כ|סכום|בסך|כולל\s+(?:מס|מיסים)|עם\s+(?:מס|מיסים))\s*(?:של)?\s*(?:ב)?\s*[:\-]?\s*[$₪]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    /(?:^|\s)ב\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:₪|ש["״']?ח)?(?:\s|$)/i,
  ];
  for (const pattern of patterns) {
    const match = request.match(pattern);
    if (match) return round2(Number(match[1].replaceAll(",", "")));
  }
  return 0;
}

function inferService(request: string) {
  const value = lower(request);
  const pair = /pair|both|two|2\s*springs|זוג|שני\s+קפיצים|שתי\s+קפיצים/.test(value);
  const spring = /spring|קפיץ|קפיצים/.test(value);
  const extension = /extension|אקסטנש(?:ן|ן)|אקסטנשן/.test(value);
  const torsion = /torsion|טורש(?:ן|יון)|טורשן|טורשיון/.test(value);
  if (extension && spring) return { category: "springs", kind: "extension", pair };
  if (torsion && spring) return { category: "springs", kind: "torsion", pair };
  if (spring) return { category: "springs", kind: "spring", pair };
  if (/opener|liftmaster|motor|פותחן|מנוע|ליפטמאסטר/.test(value)) return { category: "openers", kind: "opener", pair: false };
  if (/cable|כבל|כבלים/.test(value)) return { category: "cables", kind: "cable", pair: false };
  if (/roller|רולר|רולרים/.test(value)) return { category: "rollers", kind: "roller", pair: false };
  if (/weather|seal|אטם|גומי/.test(value)) return { category: "weather_seal", kind: "weather seal", pair: false };
  return { category: "repairs", kind: "garage door repair", pair: false };
}

function scoreProduct(product: any, service: any, request: string) {
  const haystack = lower(`${product.name} ${product.category} ${product.category_id} ${product.details}`);
  const requested = lower(request);
  const categoryId = lower(product.category_id);
  const category = lower(product.category).replaceAll(" ", "_");
  let score = 0;
  if (categoryId === service.category || category === service.category) score += 35;
  if (service.category === "springs" && haystack.includes("spring")) score += 20;
  if (service.kind !== "spring" && haystack.includes(service.kind)) score += 20;
  if (service.pair && /pair|both/.test(haystack)) score += 14;
  if (!service.pair && /pair|both/.test(haystack)) score -= 4;
  if (service.category === "springs" && /replacement|replace/.test(haystack)) score += 10;
  if (service.category === "springs" && /safety cable|inspection|adjustment/.test(haystack) && !/safety|inspection|adjust/.test(requested)) score -= 15;
  for (const word of requested.split(/[^a-z0-9א-ת]+/).filter((x: string) => x.length > 3)) {
    if (haystack.includes(word)) score += 1;
  }
  if (num(product.rate) > 0) score += 4;
  if (categoryId === "labor" || category === "labor") score -= 15;
  return score;
}

function compute(items: any[], taxRate: number) {
  const subtotal = round2(items.reduce((sum, item) => sum + num(item.qty) * num(item.rate), 0));
  const taxable = round2(items.reduce((sum, item) => sum + (item.taxable === false ? 0 : num(item.qty) * num(item.rate)), 0));
  const tax = round2(taxable * taxRate / 100);
  return { subtotal, tax_rate: taxRate, tax, total: round2(subtotal + tax) };
}

function documentType(request: string) {
  if (/receipt|קבלה/i.test(request)) return "receipt_draft";
  if (/estimate|quote|הצעת\s*מחיר/i.test(request)) return "estimate_draft";
  return "invoice_draft";
}
function requestLanguage(request: string) { return /[א-ת]/.test(request) ? "he" : "en"; }

function buildDraft(catalog: any[], request: string, targetTotal: number, taxRate: number) {
  if (!targetTotal) throw new Error("A positive requested total is required (for example: $750 including tax / 750 כולל מס).");
  const service = inferService(request);
  const parts = catalog
    .filter((product) => lower(product.category_id) !== "labor" && lower(product.category) !== "labor")
    .sort((a, b) => scoreProduct(b, service, request) - scoreProduct(a, service, request));
  const part = parts[0] || null;
  if (!part) throw new Error("No matching active catalog item was found.");

  const items = [{
    catalog_product_id: part.id,
    name: part.name,
    description: part.details || `Garage door ${service.kind} service`,
    qty: Number(part.default_qty) > 0 ? Number(part.default_qty) : 1,
    rate: round2(num(part.rate)),
    taxable: part.taxable !== false,
    category: part.category || part.category_id || "Parts",
  }];
  const totals = compute(items, taxRate);
  const catalogPricingComplete = items.every((item) => num(item.rate) > 0);
  const targetMatchesCatalog = catalogPricingComplete && Math.abs(round2(targetTotal - totals.total)) < 0.01;
  const warnings: string[] = [];

  if (!catalogPricingComplete) {
    warnings.push("The selected catalog item has no configured price. No price was invented; office/owner pricing is required before approval.");
  }
  if (catalogPricingComplete && !targetMatchesCatalog) {
    warnings.push(`The technician-supplied total (${targetTotal.toFixed(2)}) does not match the catalog-calculated total (${totals.total.toFixed(2)}). Catalog pricing was preserved and the mismatch requires review.`);
  }
  if (service.kind === "spring") {
    warnings.push("Spring type was not specified. Verify torsion versus extension spring and quantity before approval.");
  }

  return {
    document_type: documentType(request),
    language: requestLanguage(request),
    request,
    service,
    items,
    totals,
    target_total: targetTotal,
    reconciled: targetMatchesCatalog,
    catalog_pricing_complete: catalogPricingComplete,
    target_matches_catalog: targetMatchesCatalog,
    pricing_source: "active_product_catalog",
    allocation_method: "catalog_rates_only",
    warnings,
    draft_only: true,
    needs_approval: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return reply({ ok: false, error: "Unauthorized" }, 401);
    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return reply({ ok: false, error: "Unauthorized" }, 401);

    const db = createClient(URL, SERVICE);
    const { data: member } = await db.from("team").select("id,name,role,status").eq("auth_user_id", user.id).maybeSingle();
    if (!member || lower(member.status) !== "active") return reply({ ok: false, error: "Forbidden" }, 403);
    const role = lower(member.role);
    if (!["owner", "admin", "office", "dispatcher", "technician"].includes(role)) return reply({ ok: false, error: "Role not permitted" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = text(body?.action || "prepare_service_document");
    if (action === "capabilities") {
      return reply({ ok: true, role, capabilities: { prepare_service_document: true, supports_hebrew_requests: true, persists_financial_document: false, requires_approval: true, pricing_policy: "active catalog rates only; never balance or scale to a requested total", technician_scope: "assigned jobs only when job_id/customer_id is supplied" } });
    }
    if (action !== "prepare_service_document") return reply({ ok: false, error: "Unsupported action" }, 400);

    const request = text(body?.request_text);
    if (!request) return reply({ ok: false, error: "request_text required" }, 400);
    const jobId = text(body?.job_id);
    const customerId = text(body?.customer_id);
    let job: any = null;

    if (jobId) {
      const { data, error } = await db.from("jobs").select("id,customer_id,customer_name,technician_id,technician,title,status,deleted_at").eq("id", jobId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!data) return reply({ ok: false, error: "Job not found" }, 404);
      job = data;
      if (role === "technician" && String(job.technician_id || "") !== String(member.id)) return reply({ ok: false, error: "Technician may prepare documents only for an assigned job" }, 403);
    }
    if (role === "technician" && customerId && !job) return reply({ ok: false, error: "Technician customer context requires an assigned job_id" }, 403);
    if (job && customerId && String(job.customer_id || "") !== customerId) return reply({ ok: false, error: "customer_id does not match the assigned job" }, 400);

    const { data: catalog, error: catalogError } = await db.from("products").select("id,name,category,category_id,details,rate,default_qty,taxable,active").eq("active", true);
    if (catalogError) throw catalogError;
    const hasTaxRate = body?.tax_rate !== undefined && body?.tax_rate !== null && body?.tax_rate !== "";
    const taxRate = Math.max(0, Math.min(25, hasTaxRate ? num(body.tax_rate) : 6.25));
    const total = parseMoney(request, body?.total_with_tax ?? body?.total);
    const draft = buildDraft(catalog || [], request, total, taxRate);
    const result = {
      ...draft,
      job: job ? { id: job.id, customer_id: job.customer_id, customer_name: job.customer_name, title: job.title, status: job.status } : null,
      requested_by: { team_id: member.id, name: member.name, role },
      can_persist: false,
      approval_required_by: ["owner", "admin", "office"],
      next_step: draft.catalog_pricing_complete && draft.target_matches_catalog
        ? "Review the catalog-priced draft, then submit it for approval before creating or sending a financial document."
        : "Pricing review is required. Update the real Product Catalog or correct the requested total before submitting for approval; this assistant will not invent balancing prices.",
    };

    try {
      await db.from("ai_command_log").insert({ user_id: user.id, command: request, classified_intent: "prepare_service_document", action_type: "draft_only", result, status: "completed" });
    } catch {}
    return reply({ ok: true, result });
  } catch (error: any) {
    console.error("ai-technician-assistant", error);
    return reply({ ok: false, error: error?.message || "Assistant failed" }, 500);
  }
});