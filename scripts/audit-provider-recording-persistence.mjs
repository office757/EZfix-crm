import assert from 'node:assert/strict';
import fs from 'node:fs';
import { persistProviderRecording } from '../supabase/functions/_shared/provider-recording-persistence.mjs';

const callId = 'call-1';
const asset = name => ({ path: `call-recordings/provider/${callId}/${name}.mp3`, source: 'inkbox_provider' });
const a = asset('a'), b = asset('b');
const manual = { path: 'call-recordings/manual/owner.mp3', source: 'manual' };
function fixture(options = {}) {
  let row = options.missing ? null : { id: 'crm-call-1', recording_asset: options.existing || null };
  const removed = [], filters = [];
  const stored = new Set([a.path, b.path, ...(options.existing ? [options.existing.path] : [])]);
  const db = {
    from(table) {
      assert.equal(table, 'calls');
      let value, conditional = false, target;
      const query = {
        update(payload) { value = payload.recording_asset; return query; },
        select(columns) { assert.equal(columns, 'id,recording_asset'); return query; },
        eq(column, id) { assert.equal(column, 'provider_call_id'); target = id; return query; },
        is(column, expected) { filters.push([column, expected]); conditional = column === 'recording_asset' && expected === null; return query; },
        async maybeSingle() {
          assert.equal(target, callId);
          if (value) {
            assert.ok(conditional, 'UPDATE must require recording_asset IS NULL');
            if (options.beforeWrite) { row = options.beforeWrite(row); options.beforeWrite = null; }
            if (options.save === 'error') return { data: null, error: new Error('write failed') };
            if (options.save === 'throw') throw new Error('transport failed before write');
            let changed = null;
            if (row && row.recording_asset === null) {
              row.recording_asset = structuredClone(value);
              changed = structuredClone(row);
            }
            if (options.save === 'commit-throw') throw new Error('response lost after commit');
            if (options.save === 'commit-error') return { data: null, error: new Error('response lost') };
            return { data: changed, error: null };
          }
          if (options.readError) return { data: null, error: new Error('read failed') };
          return { data: structuredClone(row), error: null };
        },
      };
      return query;
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'crm-assets');
      return { async remove(paths) {
        removed.push(...paths);
        if (options.cleanupError) return { error: new Error('cleanup failed') };
        for (const path of paths) stored.delete(path);
        return { error: null };
      } };
    } },
  };
  return { db, removed, stored, filters, current: () => row };
}

let passed = 0;
async function check(name, run) {
  await run(); passed++; console.log(`PASS ${name}`);
}
await check('successful attachment remains stored', async () => {
  const f = fixture(); assert.deepEqual(await persistProviderRecording(f.db, callId, a), a);
  assert.equal(f.current().recording_asset.path, a.path); assert.deepEqual(f.removed, []);
});
await check('parallel workers converge on one asset and remove only the loser', async () => {
  const f = fixture();
  const results = await Promise.all([persistProviderRecording(f.db, callId, a), persistProviderRecording(f.db, callId, b)]);
  assert.equal(results[0].path, results[1].path);
  const winner = f.current().recording_asset.path;
  assert.ok(f.stored.has(winner)); assert.equal(f.removed.length, 1); assert.notEqual(f.removed[0], winner);
});
await check('existing manual asset cannot be replaced', async () => {
  const f = fixture({ existing: manual });
  assert.deepEqual(await persistProviderRecording(f.db, callId, a), manual);
  assert.deepEqual(f.current().recording_asset, manual); assert.deepEqual(f.removed, [a.path]);
});
await check('manual attachment arriving during ingestion wins', async () => {
  const f = fixture({ beforeWrite: row => ({ ...row, recording_asset: manual }) });
  assert.deepEqual(await persistProviderRecording(f.db, callId, a), manual);
  assert.deepEqual(f.removed, [a.path]);
});
await check('missing call is not reported as successful', async () => {
  const f = fixture({ missing: true });
  await assert.rejects(persistProviderRecording(f.db, callId, a), /Call unavailable/);
  assert.deepEqual(f.removed, [a.path]);
});
await check('confirmed write failure cleans up the unattached upload', async () => {
  const f = fixture({ save: 'error' });
  await assert.rejects(persistProviderRecording(f.db, callId, a), /could not be attached/);
  assert.deepEqual(f.removed, [a.path]); assert.equal(f.current().recording_asset, null);
});
await check('thrown write failure also reconciles before cleanup', async () => {
  const f = fixture({ save: 'throw' });
  await assert.rejects(persistProviderRecording(f.db, callId, a), /could not be attached/);
  assert.deepEqual(f.removed, [a.path]);
});
for (const save of ['commit-throw', 'commit-error']) {
  await check(`${save} retains audio after a confirmed commit`, async () => {
    const f = fixture({ save });
    assert.deepEqual(await persistProviderRecording(f.db, callId, a), a);
    assert.deepEqual(f.removed, []); assert.ok(f.stored.has(a.path));
  });
}
await check('unverifiable save retains audio rather than risking a broken attachment', async () => {
  const f = fixture({ save: 'error', readError: true });
  await assert.rejects(persistProviderRecording(f.db, callId, a), /could not be verified/);
  assert.deepEqual(f.removed, []); assert.ok(f.stored.has(a.path));
});
await check('cleanup errors are surfaced rather than silently swallowed', async () => {
  const f = fixture({ existing: manual, cleanupError: true });
  await assert.rejects(persistProviderRecording(f.db, callId, a), /cleanup failed/);
  assert.deepEqual(f.current().recording_asset, manual);
});
await check('unrelated storage paths cannot be passed to cleanup', async () => {
  const f = fixture();
  await assert.rejects(persistProviderRecording(f.db, callId, { path: 'invoices/customer.pdf' }), /Invalid provider/);
  assert.deepEqual(f.removed, []);
});
for (const name of ['sync-inkbox-calls', 'inkbox-webhook']) {
  await check(`${name} delegates provider attachment to the atomic helper`, async () => {
    const source = fs.readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
    assert.ok(source.includes('import { persistProviderRecording } from "../_shared/provider-recording-persistence.mjs";'));
    assert.ok(source.includes('return await persistProviderRecording(db,callId,asset);'));
    assert.ok(source.includes('if(readErr)throw readErr; if(!existing)throw new Error("Call unavailable for recording");'));
    assert.ok(!source.includes('update({recording_asset:asset}).eq("provider_call_id",callId);'));
  });
}
console.log(`Provider recording persistence audit: ${passed}/${passed} PASS (mocked storage/database; no provider audio requested)`);
