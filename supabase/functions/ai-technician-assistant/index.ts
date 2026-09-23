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
  const match = request.match(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/) ||
    request.match(/\b([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:dollars?|total|including\s+tax|incl\.?\s*tax)\b/i);
  return match ? round2(Number(match[1].replaceAll(",", ""))) : 0;
}

function inferService(request: string) {
  const value = lower(request);
  const pair = /pair|both|two|2\s*springs/.test(value);
  if (/extension/.test(value) && /spring/.test(value)) return { category: "springs", kind: "extension", pair };
  if (/torsion/.test(value) && /spring/.test(value)) return { category: "springs", kind: "torsion", pair };
  if (/spring/.test(value)) return { category: "springs", kind: "spring", pair };
  if (/opener|liftmaster|motor/.test(value)) return { category: "openers", kind: "opener", pair: false };
  if (/cable/.test(value)) return { category: "cables", kind: "cable", pair: false };
  if (/roller/.test(value)) return { category: "rollers", kind: "roller", pair: false };
  if (/weather|seal/.test(value)) return { category: "weather", kind: "weather seal", pair: false };
  return { category: "repair", kind: "garage door repair", pair: false };
}

function scoreProduct(product: any, service: any, request: string) {
  const haystack = lower(`${product.name} ${product.category} ${product.category_id} ${product.details}`);
  const requested = lower(request);
  let score = 0;
  if (service.category === "springs" && haystack.includes("spring")) score += 20;
  if (service.kind !== "spring" && haystack.includes(service.kind)) score += 20;
  if (service.pair && /pair|both/.test(haystack)) score += 12;
  if (!service.pair && /pair|both/.test(haystack)) score -= 4;
  for (const word of requested.split(/[^a-z0-9]+/).filter((x: string) => x.length > 4)) {
    if (haystack.includes(word)) score += 1;
  }
  if (num(product.rate) > 0) score += 4;
  if (lower(product.category_id) === "labor" || lower(product.category) === "labor") score -= 15;
  return score;
}

function compute(items: any[], taxRate: number) {
  const subtotal = round2(items.reduce((sum, item) => sum + num(item.qty) * num(item.rate), 0));
  const taxable = round2(items.reduce((sum, item) => sum + (item.taxable === false ? 0 : num(item.qty) * num(item.rate)), 0));
  const tax = round2(taxable * taxRate / 100);
  return { subtotal, tax_rate: taxRate, tax, total: round2(subtotal + tax) };
}

function buildDraft(catalog: any[], request: string, targetTotal: number, taxRate: number) {
  if (!targetTotal) throw new Error("A positive total is required (for example: $750 including tax).");

  const service = inferService(request);
  const parts = catalog
    .filter((product) => lower(product.category_id) !== "labor" && lower(product.category) !== "labor")
    .sort((a, b) => scoreProduct(b, service, request) - scoreProduct(a, service, request));
  const laborProducts = catalog.filter((product) => lower(product.category_id) === "labor" || lower(product.category) === "labor");
  const part = parts[0] || null;
  const laborItem = laborProducts.find((product) => /garage door repair labor/i.test(text(product.name))) ||
    laborProducts.find((product) => /labor/i.test(text(product.name))) || null;
  if (!part) throw new Error("No matching active catalog part/service item was found.");

  const partTaxable = part.taxable !== false;
  const laborTaxable = laborItem ? laborItem.taxable !== false : false;
  const partCatalog = num(part.rate);
  const laborCatalog = num(laborItem?.rate);
  const partTaxFactor = 1 + (partTaxable ? taxRate / 100 : 0);
  const laborTaxFactor = 1 + (laborTaxable ? taxRate / 100 : 0);

  let partAmount = 0;
  let laborAmount = 0;
  let allocationMethod = "catalog";
  const warnings: string[] = [];

  if (partCatalog > 0 && laborItem && laborCatalog <= 0) {
    const residual = targetTotal - partCatalog * partTaxFactor;
    if (residual >= 0) {
      partAmount = round2(partCatalog);
      laborAmount = round2(residual / laborTaxFactor);
      allocationMethod = "catalog_part_plus_balancing_labor";
      warnings.push("The parts rate comes from the active catalog. Labor is the balancing draft amount required to match the technician-supplied tax-inclusive total and must be reviewed before approval.");
    } else {
      partAmount = round2(targetTotal / partTaxFactor);
      allocationMethod = "target_below_catalog_part_draft";
      warnings.push("The requested total is below the selected catalog part price after tax. The draft is reconciled to the requested total, but pricing requires office/owner review.");
    }
  } else if (partCatalog <= 0 && laborItem && laborCatalog > 0) {
    const residual = targetTotal - laborCatalog * laborTaxFactor;
    if (residual >= 0) {
      laborAmount = round2(laborCatalog);
      partAmount = round2(residual / partTaxFactor);
      allocationMethod = "catalog_labor_plus_balancing_part";
      warnings.push("The labor rate comes from the active catalog. Parts are the balancing draft amount required to match the technician-supplied tax-inclusive total and must be reviewed before approval.");
    } else {
      laborAmount = round2(targetTotal / laborTaxFactor);
      allocationMethod = "target_below_catalog_labor_draft";
      warnings.push("The requested total is below the selected catalog labor price after tax. The draft is reconciled to the requested total, but pricing requires office/owner review.");
    }
  } else if (partCatalog > 0 && laborCatalog > 0) {
    const totalWeight = partCatalog + laborCatalog;
    const effectiveTaxRate = (partCatalog * (partTaxable ? taxRate : 0) + laborCatalog * (laborTaxable ? taxRate : 0)) / totalWeight;
    const pretaxTarget = targetTotal / (1 + effectiveTaxRate / 100);
    partAmount = round2(pretaxTarget * partCatalog / totalWeight);
    laborAmount = round2(pretaxTarget - partAmount);
    allocationMethod = "scaled_catalog_proportions";
    warnings.push("Catalog rates were used as allocation weights and proportionally scaled to the technician-supplied tax-inclusive total. Review the adjusted draft rates before approval.");
  } else {
    const partShare = laborItem ? 0.70 : 1;
    const laborShare = laborItem ? 0.30 : 0;
    const effectiveTaxRate = partShare * (partTaxable ? taxRate : 0) + laborShare * (laborTaxable ? taxRate : 0);
    const pretaxTarget = targetTotal / (1 + effectiveTaxRate / 100);
    partAmount = round2(pretaxTarget * partShare);
    laborAmount = laborItem ? round2(pretaxTarget - partAmount) : 0;
    allocationMethod = "editable_70_30_draft";
    warnings.push("Catalog rates for the selected service/labor are $0, so the parts/labor split is an editable draft allocation. The exact customer total and tax math are reconciled; review the split before approval.");
  }

  if (service.kind === "spring") {
    warnings.push("Spring type was not specified. Verify torsion versus extension spring and quantity before approving the document.");
  }

  const items: any[] = [{
    catalog_product_id: part.id,
    name: part.name,
    description: part.details || `Garage door ${service.kind} service`,
    qty: 1,
    rate: partAmount,
    taxable: partTaxable,
    category: part.category || part.category_id || "Parts",
  }];
  if (laborItem && laborAmount > 0) {
    items.push({
      catalog_product_id: laborItem.id,
      name: laborItem.name,
      description: laborItem.details || "Labor for diagnosed garage door repair work performed.",
      qty: 1,
      rate: laborAmount,
      taxable: laborTaxable,
      category: laborItem.category || "Labor",
    });
  }

  let totals = compute(items, taxRate);
  let delta = round2(targetTotal - totals.total);
  let guard = 0;
  while (Math.abs(delta) >= 0.009 && guard++ < 6) {
    const index = items.length > 1 ? items.length - 1 : 0;
    const factor = 1 + (items[index].taxable === false ? 0 : taxRate / 100);
    items[index].rate = round2(items[index].rate + delta / factor);
    totals = compute(items, taxRate);
    delta = round2(targetTotal - totals.total);
  }

  return {
    document_type: /receipt/i.test(request) ? "receipt_draft" : /estimate|quote/i.test(request) ? "estimate_draft" : "invoice_draft",
    request,
    service,
    items,
    totals,
    target_total: targetTotal,
    reconciled: Math.abs(round2(targetTotal - totals.total)) < 0.01,
    allocation_method: allocationMethod,
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
      return reply({
        ok: true,
        role,
        capabilities: {
          prepare_service_document: true,
          persists_financial_document: false,
          requires_approval: true,
          technician_scope: "assigned jobs only when job_id/customer_id is supplied",
        },
      });
    }
    if (action !== "prepare_service_document") return reply({ ok: false, error: "Unsupported action" }, 400);

    const request = text(body?.request_text);
    if (!request) return reply({ ok: false, error: "request_text required" }, 400);
    const jobId = text(body?.job_id);
    const customerId = text(body?.customer_id);
    let job: any = null;

    if (jobId) {
      const { data, error } = await db.from("jobs")
        .select("id,customer_id,customer_name,technician_id,technician,title,status,deleted_at")
        .eq("id", jobId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!data) return reply({ ok: false, error: "Job not found" }, 404);
      job = data;
      if (role === "technician" && String(job.technician_id || "") !== String(member.id)) {
        return reply({ ok: false, error: "Technician may prepare documents only for an assigned job" }, 403);
      }
    }
    if (role === "technician" && customerId && !job) {
      return reply({ ok: false, error: "Technician customer context requires an assigned job_id" }, 403);
    }
    if (job && customerId && String(job.customer_id || "") !== customerId) {
      return reply({ ok: false, error: "customer_id does not match the assigned job" }, 400);
    }

    const { data: catalog, error: catalogError } = await db.from("products")
      .select("id,name,category,category_id,details,rate,default_qty,taxable,active")
      .eq("active", true);
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
      next_step: role === "technician"
        ? "Review the draft, then submit it for office/owner approval before creating or sending a financial document."
        : "Review and explicitly approve before creating or sending the financial document.",
    };

    try {
      await db.from("ai_command_log").insert({
        user_id: user.id,
        command: request,
        classified_intent: "prepare_service_document",
        action_type: "draft_only",
        result,
        status: "completed",
      });
    } catch {}

    return reply({ ok: true, result });
  } catch (error: any) {
    console.error("ai-technician-assistant", error);
    return reply({ ok: false, error: error?.message || "Assistant failed" }, 500);
  }
});
