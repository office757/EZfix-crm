import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import whatsapp from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { Bridge } from './bridge.mjs';

process.umask(0o077);
const data = path.resolve(process.env.WA_DATA_DIR || 'data');
mkdirSync(data, { recursive: true, mode: 0o700 });
chmodSync(data, 0o700);
const tokenPath = path.join(data, 'bridge-token');
let token;
try { token = readFileSync(tokenPath, 'utf8').trim(); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  token = randomBytes(32).toString('hex');
  writeFileSync(tokenPath, token, { mode: 0o600, flag: 'wx' });
}
if (token.length < 32) throw new Error('Bridge token must contain at least 32 characters');
const client = new whatsapp.Client({
  authStrategy: new whatsapp.LocalAuth({ clientId: 'ezfix', dataPath: path.join(data, 'session') }),
  puppeteer: { headless: true, ...(process.env.WA_CHROME_PATH ? { executablePath: process.env.WA_CHROME_PATH } : {}) },
});
const bridge = new Bridge(client, path.join(data, 'messages.sqlite'));
const port = Number(process.env.WA_PORT || 8787);
const authorized = value => {
  const supplied = Buffer.from(value || '');
  const expected = Buffer.from('Bearer ' + token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};
const server = http.createServer(async (req, res) => {
  const reply = (status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(value));
  };
  // Loopback only, no cross-origin browser access. CRM must use a trusted server connector.
  if (req.headers.origin || !authorized(req.headers.authorization)) return reply(401, { error: 'Unauthorized' });
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/status') return reply(200, { state: bridge.state });
    if (req.method === 'GET' && url.pathname === '/qr') {
      const qr = bridge.qr;
      return reply(200, { state: bridge.state, qr_data_url: qr ? await QRCode.toDataURL(qr) : null });
    }
    if (req.method === 'GET' && url.pathname === '/events') return reply(200, { events: bridge.events(Number(url.searchParams.get('after') || 0)) });
    if (req.method === 'POST' && url.pathname === '/send') {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32768) return reply(413, { error: 'Request too large' });
        chunks.push(chunk);
      }
      const result = await bridge.send(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      return reply(result.status, result);
    }
    return reply(404, { error: 'Not found' });
  } catch { return reply(400, { error: 'Invalid request' }); }
});
server.listen(port, '127.0.0.1', () => console.log(`WhatsApp bridge: http://127.0.0.1:${port}; credentials stored locally in ${tokenPath}`));
client.initialize().catch(() => { bridge.state = 'startup_failed'; console.error('WhatsApp browser failed to start. Check host browser dependencies and sandbox support.'); });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  await client.destroy().catch(() => {});
  bridge.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
