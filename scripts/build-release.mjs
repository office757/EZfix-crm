import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Keep Vercel's buildCommand short while retaining every existing release gate.
// Run sequentially: failed tests stop the build, and transforms keep their order.
const scripts = [
  'test-public-routes.mjs',
  'audit-public-routes.mjs',
  'audit-invoice-preview-access.mjs',
  'audit-public-invoice-totals.mjs',
  'audit-public-invoice-token.mjs',
  'audit-website-sms-consent.mjs',
  'audit-ui-state.mjs',
  'build-ui-state.mjs',
  'audit-product-catalog-ui.mjs',
  'audit-catalog-labor-metadata.mjs',
  'audit-quickpay-recovery.mjs',
  'audit-modal-actions.mjs',
  'build-product-catalog-ui.mjs',
  'audit-visualizer-gallery-premium.mjs',
  'build-visualizer-gallery-premium.mjs',
  'audit-marketing-connections-ui.mjs',
  'build-marketing-connections-ui.mjs',
  'audit-assignment-whatsapp.mjs',
  'build-assignment-whatsapp.mjs',
  'audit-call-recordings.mjs',
  'audit-provider-recording-persistence.mjs',
  'audit-recording-download.mjs',
  'audit-transcript-replay.mjs',
  'audit-transcript-replay-integration.mjs',
  'audit-call-audio-access.mjs',
  'audit-replay-storage-preflight.mjs',
  'build-transcript-replay-ui.mjs',
  'audit-calendar-overlap.mjs',
  'build-calendar-overlap.mjs',
  'audit-calendar-premium.mjs',
  'build-calendar-premium.mjs',
  'audit-ui-state.mjs',
  'audit-product-catalog-ui.mjs',
  'audit-visualizer-gallery-premium.mjs',
  'audit-marketing-connections-ui.mjs',
  'audit-assignment-whatsapp.mjs',
  'audit-call-recordings.mjs',
  'audit-transcript-replay-integration.mjs',
  'audit-superezx-telephony-adapter.mjs'
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
