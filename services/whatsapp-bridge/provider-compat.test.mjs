import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { patchProviderSource } from './provider-compat.mjs';

const require = createRequire(import.meta.url);
// Web-only builds do not install the separate host package. Keep the exact
// upstream lookup fixture there; host tests use the installed full SDK source.
let source = "function result() { return window\n.require('WAWebCollections')\n.Msg.get(newMsgKey._serialized); }";
try {
  source = readFileSync(require.resolve('whatsapp-web.js/src/util/Injected/Utils.js'), 'utf8');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const patched = patchProviderSource(source, '1.34.7');
// Execute the result lookup extracted from the actual installed SDK. No browser
// is launched, and no live message or account is used by these tests.
const lookup = patched.match(/return window\s*\.require\('WAWebCollections'\)\s*\.Msg\.get\(newMsgKey\._serialized \?\? newMsgKey\.\$1\);/)[0];
for (const [label, key] of [['legacy', {_serialized:'exact-key'}], ['renamed', {$1:'exact-key'}]]) {
  test(`SDK result lookup returns the exact sent message for ${label} keys`, () => {
    const sent = { id: key };
    const context = { newMsgKey: key, window: { require: () => ({ Msg: new Map([['exact-key', sent]]) }) } };
    assert.equal(vm.runInNewContext(`(() => { ${lookup} })()`, context), sent);
  });
}
test('missing provider key cannot manufacture a successful result', () => {
  const context = { newMsgKey: {}, window: { require: () => ({ Msg: new Map([['other', {id: 'other'}]]) }) } };
  assert.equal(vm.runInNewContext(`(() => { ${lookup} })()`, context), undefined);
});
test('patch is narrow, repeatable and rejects source/version drift', () => {
  assert.equal(patchProviderSource(patched, '1.34.7'), patched);
  assert.throws(() => patchProviderSource(source, '1.34.8'));
  assert.throws(() => patchProviderSource('', '1.34.7'));
  assert.throws(() => patchProviderSource(source + source, '1.34.7'));
  new vm.Script(patched);
});
