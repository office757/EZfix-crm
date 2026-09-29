import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// whatsapp-web.js 1.34.7 sends successfully but looks up the result using only
// the old key property. Fix that one lookup before the SDK is imported.
// Do not infer a send result by matching message text, recipient or time.
export function patchProviderSource(source, version) {
  if (version !== '1.34.7') throw new Error('Review WhatsApp compatibility patch before upgrading the SDK');
  const original = '.Msg.get(newMsgKey._serialized)';
  const fixed = '.Msg.get(newMsgKey._serialized ?? newMsgKey.$1)';
  if (source.split(fixed).length === 2 && !source.includes(original)) return source;
  if (source.split(original).length !== 2 || source.includes(fixed)) {
    throw new Error('Unexpected WhatsApp SDK source; refusing an unverified patch');
  }
  return source.replace(original, fixed);
}

export function prepareProvider() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('whatsapp-web.js/package.json');
  const { version } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const utilsPath = path.join(path.dirname(manifestPath), 'src/util/Injected/Utils.js');
  // A previously loaded SDK would retain an unpatched copy in memory.
  if (require.cache[utilsPath]) throw new Error('Prepare WhatsApp compatibility before importing the SDK');
  const source = readFileSync(utilsPath, 'utf8');
  const patched = patchProviderSource(source, version);
  if (source !== patched) writeFileSync(utilsPath, patched, 'utf8');
}
