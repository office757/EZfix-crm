import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Keep Vercel's buildCommand short while retaining every existing release gate.
// Run sequentially: failed tests stop the build, and transforms keep their order.
const scripts = [
  'test-public-routes.mjs',
  'audit-public-routes.mjs',
  'audit-public-invoice-totals.mjs',
  'audit-website-sms-consent.mjs',
  'audit-ui-state.mjs',
  'build-ui-state.mjs',
  'audit-product-catalog-ui.mjs',
  'build-product-catalog-ui.mjs',\n  'audit-visualizer-gallery-premium.mjs',\n  'build-visualizer-gallery-premium.mjs',
  'audit-assignment-whatsapp.mjs',
  'build-assignment-whatsapp.mjs',
  'audit-calendar-overlap.mjs',
  'build-calendar-overlap.mjs',
  'audit-calendar-premium.mjs',
  'build-calendar-premium.mjs',
  'audit-ui-state.mjs',
  'audit-product-catalog-ui.mjs',\n  'audit-visualizer-gallery-premium.mjs',
  'audit-assignment-whatsapp.mjs'
];
const root = fileURLToPath(new URL('../', import.meta.url));
for (const script of scripts) {
  console.log(`\nRelease step: ${script}`);
  execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
    cwd: root,
    stdio: 'inherit'
  });
}
console.log('\nAll release steps completed.');
