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
warnPattern(
  'Payment recording can append from cached STORE state',
  /async\s+recordPayment\s*\([^)]*\)\s*\{[\s\S]{0,900}?getOne\(\s*['"]invoices['"]/,
  'Appending to inv.payments from the client cache can lose a newer payment. Re-read authoritative payment state inside the invoice mutation boundary.'
);
warnPattern(
  'Collection queries still use a silent 500-row ceiling',
  /\.limit\(\s*500\s*\)/,
  'Search, reports, duplicate checks, and history can become incomplete once a collection exceeds 500 rows.'
);

console.log(`CRM safety audit: ${passes.length} pass, ${warnings.length} warning, ${failures.length} fail`);
for (const item of passes) console.log(`PASS ${item}`);
for (const item of warnings) console.warn(`WARN ${item}`);
for (const item of failures) console.error(`FAIL ${item}`);

if (failures.length || (strict && warnings.length)) process.exitCode = 1;
