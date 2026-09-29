import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Bridge } from './bridge.mjs';
function fixture(t, database = ':memory:') {
  const client = new EventEmitter();
  client.calls = 0;
  client.getNumberId = async () => ({ _serialized: '15555550123@c.us' });
  client.sendMessage = async () => { client.calls++; return { id: { _serialized: 'provider-test-1' } }; };
  const bridge = new Bridge(client, database);
  t.after(() => bridge.close());
  return { client, bridge };
}
const request = { request_id: 'request_000000001', to: '+15555550123', body: 'Test fixture only' };
test('QR clears when authenticated and disconnect prevents sending', async t => {
  const { client, bridge } = fixture(t);
  client.emit('qr', 'secret'); assert.equal(bridge.state, 'awaiting_qr');
  client.emit('authenticated'); assert.equal(bridge.qr, null);
  client.emit('ready'); client.emit('disconnected');
  assert.equal((await bridge.send(request)).status, 503); assert.equal(client.calls, 0);
});
test('concurrent retries send once; changed payload with same ID rejected', async t => {
  const { client, bridge } = fixture(t); client.emit('ready');
  const results = await Promise.all([bridge.send(request), bridge.send(request)]);
  assert.equal(client.calls, 1); assert.ok(results.some(r => r.duplicate));
  assert.equal((await bridge.send({ ...request, body: 'Changed' })).status, 409);
});
test('ambiguous provider failure is never automatically sent again', async t => {
  const { client, bridge } = fixture(t); client.emit('ready');
  client.sendMessage = async () => { client.calls++; throw new Error('Disconnected after submit'); };
  assert.equal((await bridge.send(request)).state, 'unconfirmed');
  assert.equal((await bridge.send(request)).state, 'unconfirmed'); assert.equal(client.calls, 1);
});
test('inbound deduplication, group exclusion and cursor pagination', t => {
  const { client, bridge } = fixture(t);
  const message = { from: '15555550123@c.us', fromMe: false, id: { _serialized: 'incoming1' }, type: 'chat', body: 'Hello', timestamp: 123 };
  client.emit('message_create', message); client.emit('message_create', message);
  client.emit('message_create', { ...message, from: 'group@g.us', id: { _serialized: 'group1' } });
  const events = bridge.events(); assert.equal(events.length, 1); assert.equal(events[0].direction, 'inbound');
  assert.deepEqual(bridge.events(events[0].seq), []);
});
test('restart preserves inbound events and prevents duplicate sends', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wa-bridge-test-'));
  const database = path.join(dir, 'state.sqlite');
  const client = new EventEmitter();
  client.getNumberId = async () => ({ _serialized: 'test@c.us' });
  client.sendMessage = async () => ({ id: { _serialized: 'outgoing1' } });
  let bridge = new Bridge(client, database); client.emit('ready');
  await bridge.send(request); bridge.record('fixture', { type: 'test' }); bridge.close();
  bridge = new Bridge(new EventEmitter(), database);
  try { assert.equal((await bridge.send(request)).duplicate, true); assert.equal(bridge.events().length, 1); }
  finally { bridge.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('invalid recipient and empty message rejected before provider calls', async t => {
  const { client, bridge } = fixture(t); client.emit('ready');
  assert.equal((await bridge.send({ ...request, to: '123' })).status, 400);
  assert.equal((await bridge.send({ ...request, body: ' ' })).status, 400);
  assert.equal(client.calls, 0);
});
