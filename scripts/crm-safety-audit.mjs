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
  'Payment recording re-reads authoritative invoice state inside its mutation queue',
  /async\s+recordPayment\s*\([^)]*\)\s*\{[\s\S]{0,1800}?queueMutation\s*\(\s*`record:invoices:\$\{invoiceId\}`[\s\S]{0,1800}?SB\.from\(\s*['"]invoices['"]\s*\)[\s\S]{0,400}?select\(\s*['"]id,payments,deleted_at['"]\s*\)/,
  'Payment append must derive from the latest database payments inside the same invoice mutation boundary, not from STORE.'
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

console.log(`CRM safety audit: ${passes.length} pass, ${warnings.length} warning, ${failures.length} fail`);
for (const item of passes) console.log(`PASS ${item}`);
for (const item of warnings) console.warn(`WARN ${item}`);
for (const item of failures) console.error(`FAIL ${item}`);

if (failures.length || (strict && warnings.length)) process.exitCode = 1;
