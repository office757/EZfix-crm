#!/usr/bin/env node

/**
 * Lightweight static guardrails for the single-file EZfix CRM.
 *
 * Default mode reports unresolved risks without blocking. Use --strict to make
 * advisory findings fail CI once those paths have been hardened.
 *
 * This script does not connect to Supabase and never touches production data.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const file = path.join(root, 'index.html');
const strict = process.argv.includes('--strict');

if (!fs.existsSync(file)) {
  console.error('FAIL index.html was not found at the repository root.');
  process.exit(2);
}

const source = fs.readFileSync(file, 'utf8');
const failures = [];
const warnings = [];
const passes = [];

function requirePattern(name, pattern, why) {
  if (pattern.test(source)) passes.push(name);
  else failures.push(`${name}: ${why}`);
}

function warnPattern(name, pattern, why) {
  if (pattern.test(source)) warnings.push(`${name}: ${why}`);
  else passes.push(name);
}

// Regression guards for persistence hardening already present on the working branch.
requirePattern(
  'Settings are declared in KNOWN_COLUMNS',
  /settings\s*:\s*\[\s*['"]id['"][\s\S]*?['"]app_data['"]\s*\]/,
  'Settings can otherwise fall through generic app_data serialization unexpectedly.'
);
requirePattern(
  'Record deletes share the record mutation queue',
  /async function dbDelete\s*\([^)]*\)[\s\S]{0,700}?queueMutation\s*\(\s*`record:\$\{col\}:\$\{id\}`/,
  'Save and delete operations for the same record can race.'
);
requirePattern(
  'Delete requires database acknowledgement',
  /dbDelete[\s\S]{0,1400}?\.select\(\s*['"]id['"]\s*\)\.maybeSingle\(\)/,
  'A denied/no-op delete could otherwise be presented as successful.'
);
requirePattern(
  'Immediate Team cache writes normalize role/status',
  /function replaceStoreRecord[\s\S]{0,1200}?col\s*===\s*['"]team['"][\s\S]{0,900}?Owner\/Admin[\s\S]{0,900}?Technician/,
  'The post-save cache can otherwise disagree with refreshCollection display values.'
);

// Advisory checks for the next hardening pass. These are deliberately warnings
// because the durable cross-session solution needs an atomic backend/payment model.
warnPattern(
  'Invoice editor can copy a stale payments snapshot',
  /payments\s*:\s*inv\?\.payments\s*\|\|\s*\[\]/,
  'Editing an invoice opened before a newer payment can overwrite payment history. Existing invoice edits should omit payments entirely.'
);
requirePattern(
  'Payment recording uses an authoritative atomic invoice mutation',
  /async\s+recordPayment\s*\([^)]*\)\s*\{[\s\S]{0,2200}?queueMutation\s*\(\s*`record:invoices:\$\{invoiceId\}`[\s\S]{0,2200}?SB\.rpc\(\s*['"]append_invoice_payment['"][\s\S]{0,900}?p_expected_row_version/,
  'Payment append must execute through the atomic append_invoice_payment RPC with an expected row version instead of deriving from STORE.'
);
requirePattern(
  'Collection refresh paginates beyond 500 rows',
  /async function refreshCollection\s*\([^)]*\)[\s\S]{0,1800}?const pageSize\s*=\s*500[\s\S]{0,1800}?\.range\(\s*from\s*,\s*from\s*\+\s*pageSize\s*-\s*1\s*\)[\s\S]{0,1800}?if\s*\(\s*page\.length\s*<\s*pageSize\s*\)\s*break/,
  'Collection refreshes must page through the full result set instead of silently truncating at 500 rows.'
);

requirePattern(
  'Job status history appends from authoritative database state',
  /async function updateJobStatusWithHistory\s*\([^)]*\)[\s\S]{0,2200}?queueMutation\s*\(\s*`record:jobs:\$\{jobId\}`[\s\S]{0,1600}?select\(\s*['"]id,status_history,deleted_at['"]\s*\)[\s\S]{0,1600}?status_history/,
  'Status changes must append to the latest stored job history instead of a potentially stale STORE snapshot.'
);

requirePattern(
  'Job editor does not write stale status history snapshots',
  /if\s*\(\s*j\s*\)\s*\{[\s\S]{0,500}?if\s*\(\s*statusChanged\s*\)\s*await\s+updateJobStatusWithHistory\(\s*j\.id\s*,\s*newStatus\s*,\s*data\s*\)[\s\S]{0,300}?else\s+await\s+dbSet\(\s*['"]jobs['"]\s*,\s*j\.id\s*,\s*data\s*\)/,
  'Existing job edits must preserve authoritative status history; status changes must use the history-aware helper.'
);

requirePattern(
  'Document editors track explicit photo changes',
  /let\s+docPhotosDirty\s*=\s*false[\s\S]{0,7000}?docPhotosDirty\s*=\s*true[\s\S]{0,2500}?function\s+removeDocPhoto\([^)]*\)\s*\{\s*docPhotosDirty\s*=\s*true/,
  'Document photo add/remove operations must mark the shared draft dirty.'
);
requirePattern(
  'Lead editor only writes photos after an explicit photo change',
  /openLeadModal[\s\S]{0,7500}?\.\.\.\(docPhotosDirty\s*\|\|\s*!l\s*\?\s*\{\s*photos:/,
  'Existing lead edits must not overwrite photos from a stale editor snapshot.'
);
requirePattern(
  'Estimate editor only writes photos after an explicit photo change',
  /openEstimateModal[\s\S]{0,9500}?\.\.\.\(docPhotosDirty\s*\|\|\s*!e\s*\?\s*\{\s*photos:/,
  'Existing estimate edits must not overwrite photos from a stale editor snapshot.'
);
requirePattern(
  'Invoice editor only writes photos after an explicit photo change',
  /openInvoiceModal[\s\S]{0,10500}?\.\.\.\(docPhotosDirty\s*\|\|\s*!inv\s*\?\s*\{\s*photos:/,
  'Existing invoice edits must not overwrite photos from a stale editor snapshot.'
);

requirePattern(
  'Settings saves merge onto authoritative database state',
  /async function saveSettings\s*\([^)]*\)[\s\S]{0,1800}?SB\.from\(\s*['"]settings['"]\s*\)\.select\(\s*['"]\*['"]\s*\)\.eq\(\s*['"]id['"]\s*,\s*['"]main['"]\s*\)\.maybeSingle\(\)[\s\S]{0,1200}?const next\s*=\s*\{\s*\.\.\.current\s*,\s*\.\.\.data\s*\}/,
  'Partial settings changes must merge onto the latest database row instead of potentially stale local SETTINGS.'
);

requirePattern(
  'Lead conversion uses an atomic database RPC',
  /async function convertLead[\s\S]{0,1800}?SB\.rpc\(\s*['"]convert_lead_to_customer_job['"]/,
  'Lead conversion must be claimed atomically in the database so concurrent tabs/users cannot create duplicate customer/job records.'
);
requirePattern(
  'Estimate-to-job conversion uses an atomic database RPC',
  /async function convertEstimateToJob[\s\S]{0,1800}?SB\.rpc\(\s*['"]convert_estimate_to_job['"]/,
  'Estimate-to-job conversion must be claimed atomically in the database so concurrent tabs/users cannot create duplicate jobs.'
);
requirePattern(
  'Estimate-to-invoice conversion uses an atomic database RPC',
  /async function convertEstimateToInvoice[\s\S]{0,1800}?SB\.rpc\(\s*['"]convert_estimate_to_invoice['"]/,
  'Estimate-to-invoice conversion must be claimed atomically in the database so concurrent tabs/users cannot create duplicate invoices.'
);

requirePattern(
  'Job photo actions mark the editor dirty',
  /let\s+jobPhotosDirty\s*=\s*false[\s\S]{0,3500}?jobPhotosDirty\s*=\s*true[\s\S]{0,1800}?function\s+removeJobPhoto\([^)]*\)\s*\{\s*jobPhotosDirty\s*=\s*true/,
  'Job photo add/remove operations must mark the draft dirty.'
);
requirePattern(
  'Job editor only writes photos after an explicit photo change',
  /openJobModal[\s\S]{0,10500}?\.\.\.\(jobPhotosDirty\s*\|\|\s*!j\s*\?\s*\{\s*photos:/,
  'Existing job edits must not overwrite photos from a stale editor snapshot unless the user explicitly changed photos.'
);

requirePattern(
  'Payment overpay validation uses latest invoice state',
  /openPaymentModal[\s\S]{0,5000}?SB\.from\(\s*['"]invoices['"]\s*\)\.select\(\s*['"]\*['"]\s*\)\.eq\(\s*['"]id['"]\s*,\s*inv\.id\s*\)[\s\S]{0,800}?const currentBalance\s*=\s*balanceDue\(\s*latestInv\s*\)/,
  'Payment amount validation must use the current database balance, not the invoice snapshot captured when the modal opened.'
);

requirePattern(
  'Job checklist controls mark the editor dirty',
  /openJobModal[\s\S]{0,8500}?onchange=["']jobChecklistDirty=true["']/,
  'Checklist changes must explicitly mark the job draft dirty.'
);
requirePattern(
  'Job editor only writes checklist after an explicit checklist change',
  /openJobModal[\s\S]{0,12000}?\.\.\.\(jobChecklistDirty\s*\|\|\s*!j\s*\?\s*\{\s*checklist:/,
  'Existing job edits must not overwrite checklist state from a stale editor snapshot unless the user explicitly changed the checklist.'
);

console.log(`CRM safety audit: ${passes.length} pass, ${warnings.length} warning, ${failures.length} fail`);
for (const item of passes) console.log(`PASS ${item}`);
for (const item of warnings) console.warn(`WARN ${item}`);
for (const item of failures) console.error(`FAIL ${item}`);

if (failures.length || (strict && warnings.length)) process.exitCode = 1;
