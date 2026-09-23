export const READ_TOOLS = new Set([
  'status',
  'summary',
  'accounts',
  'campaigns',
  'metrics',
  'attribution',
  'permissions',
  'approval_queue',
  'audit_log',
]);

export function normalizeTool(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function assertReadTool(value) {
  const tool = normalizeTool(value);
  if (!READ_TOOLS.has(tool)) {
    const error = new Error('Tool not allowed on Google Ads read-only endpoint');
    error.code = 'READ_ONLY_TOOL_BLOCKED';
    throw error;
  }
  return tool;
}

export function clampLimit(value, fallback = 100) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(250, Math.max(1, Math.floor(n)));
}

export function cleanId(value) {
  const out = String(value ?? '').trim();
  if (!out) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(out)) {
    const error = new Error('Invalid identifier filter');
    error.code = 'INVALID_FILTER';
    throw error;
  }
  return out;
}

export function cleanDate(value) {
  const out = String(value ?? '').trim();
  if (!out) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out)) {
    const error = new Error('Invalid date filter');
    error.code = 'INVALID_FILTER';
    throw error;
  }
  const [y, m, d] = out.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    const error = new Error('Invalid date filter');
    error.code = 'INVALID_FILTER';
    throw error;
  }
  return out;
}

export function cleanApprovalStatus(value) {
  const out = String(value ?? '').trim().toLowerCase();
  if (!out) return 'pending';
  if (!['pending', 'approved', 'rejected'].includes(out)) {
    const error = new Error('Invalid approval status filter');
    error.code = 'INVALID_FILTER';
    throw error;
  }
  return out;
}

export function normalizeInput(input = {}) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const date_from = cleanDate(src.date_from);
  const date_to = cleanDate(src.date_to);
  if (date_from && date_to && date_from > date_to) {
    const error = new Error('date_from must be on or before date_to');
    error.code = 'INVALID_FILTER';
    throw error;
  }
  return {
    customer_id: cleanId(src.customer_id),
    campaign_id: cleanId(src.campaign_id),
    date_from,
    date_to,
    approval_status: cleanApprovalStatus(src.approval_status),
    limit: clampLimit(src.limit),
  };
}

export function permissionActionFor(tool) {
  return tool === 'attribution' ? 'read_crm_attribution' : 'read';
}

export function auditInput(input) {
  return {
    customer_id: input.customer_id,
    campaign_id: input.campaign_id,
    date_from: input.date_from,
    date_to: input.date_to,
    approval_status: input.approval_status,
    limit: input.limit,
  };
}

export function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function aggregateCampaignSnapshot(rows = []) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.impressions += toFiniteNumber(row?.impressions);
      acc.clicks += toFiniteNumber(row?.clicks);
      acc.cost_micros += toFiniteNumber(row?.cost_micros);
      acc.conversions += toFiniteNumber(row?.conversions);
      acc.conversions_value += toFiniteNumber(row?.conversions_value);
      if (String(row?.status ?? '').toUpperCase() === 'ENABLED') acc.enabled_campaigns += 1;
      return acc;
    },
    {
      campaigns: rows.length,
      enabled_campaigns: 0,
      impressions: 0,
      clicks: 0,
      cost_micros: 0,
      conversions: 0,
      conversions_value: 0,
    },
  );
  return {
    ...totals,
    cost: totals.cost_micros / 1_000_000,
    ctr_percent: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    avg_cpc: totals.clicks > 0 ? (totals.cost_micros / 1_000_000) / totals.clicks : 0,
  };
}

export function aggregateAttribution(rows = []) {
  return rows.reduce(
    (acc, row) => {
      acc.attributed_leads += toFiniteNumber(row?.attributed_leads);
      acc.gclid_leads += toFiniteNumber(row?.gclid_leads);
      acc.privacy_click_id_leads += toFiniteNumber(row?.privacy_click_id_leads);
      return acc;
    },
    { attributed_leads: 0, gclid_leads: 0, privacy_click_id_leads: 0 },
  );
}
