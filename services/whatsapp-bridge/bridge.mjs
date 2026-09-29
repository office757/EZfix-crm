import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

export class Bridge {
  constructor(client, database) {
    this.client = client;
    this.state = 'starting';
    this.qr = null;
    this.db = new DatabaseSync(database);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT UNIQUE NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sends(request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, state TEXT NOT NULL, provider_id TEXT);
      UPDATE sends SET state='unconfirmed' WHERE state='sending';`);
    client.on('qr', qr => { this.qr = qr; this.state = 'awaiting_qr'; });
    client.on('authenticated', () => { this.qr = null; this.state = 'loading'; });
    client.on('ready', () => { this.qr = null; this.state = 'ready'; });
    client.on('auth_failure', () => { this.qr = null; this.state = 'authentication_failed'; });
    client.on('disconnected', () => { this.qr = null; this.state = 'disconnected'; });
    client.on('message_create', message => {
      const peer = message.fromMe ? message.to : message.from;
      if (typeof peer !== 'string' || !/^\d+@(c\.us|lid)$/.test(peer) || message.type !== 'chat' || typeof message.id?._serialized !== 'string' || !Number.isFinite(message.timestamp)) return;
      this.record('message:' + message.id._serialized, {
        type: 'message', provider: 'whatsapp_linked_device', id: message.id._serialized,
        chat_id: peer, direction: message.fromMe ? 'outbound' : 'inbound',
        body: String(message.body || '').slice(0, 20000), timestamp: message.timestamp,
      });
      if(peer.endsWith('@lid')&&typeof client.getContactLidAndPhone==='function'){
        client.getContactLidAndPhone([peer]).then(rows=>{
          const mapped=rows.find(row=>row.lid===peer&&/^\d{8,15}@c\.us$/.test(row.pn||''));
          if(mapped)this.record('contact:'+peer+':'+mapped.pn,{type:'contact',id:peer,chat_id:peer,phone_e164:'+'+mapped.pn.split('@')[0]});
        }).catch(()=>{}); // Unknown identifiers stay unlinked; never guess a number.
      }
    });
    client.on('message_ack', (message, ack) => {
      if(typeof message?.id?._serialized!=='string'||!Number.isInteger(ack)||ack < -1||ack > 4)return;
      const peer=message.fromMe?message.to:message.from;if(peer&&!/^\d+@(c\.us|lid)$/.test(peer))return;
      this.record(`ack:${message.id._serialized}:${ack}`, {
        type: 'ack', id: message.id._serialized, ack,
      });
    });
  }
  record(key, event) {
    this.db.prepare('INSERT OR IGNORE INTO events(event_key,payload) VALUES(?,?)').run(key, JSON.stringify(event));
  }
  events(after = 0) {
    if (!Number.isSafeInteger(after) || after < 0) throw new Error('Invalid cursor');
    return this.db.prepare('SELECT seq,payload FROM events WHERE seq>? ORDER BY seq LIMIT 100').all(after)
      .map(row => ({ seq: row.seq, ...JSON.parse(row.payload) }));
  }
  async send({ request_id, to, body }) {
    if (typeof request_id!=='string'||typeof to!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(request_id) ||
        !/^\+[1-9]\d{7,14}$/.test(to || '') || typeof body !== 'string' || !body.trim() || body.length > 4096) {
      return { status: 400, error: 'request_id, E.164 recipient and text (1–4096 characters) required' };
    }
    const fingerprint = createHash('sha256').update(JSON.stringify([to, body])).digest('hex');
    const previous = this.db.prepare('SELECT * FROM sends WHERE request_id=?').get(request_id);
    if (previous) return previous.fingerprint === fingerprint
      ? { status: 200, state: previous.state, provider_id: previous.provider_id, duplicate: true }
      : { status: 409, error: 'Request ID already used for another message' };
    if (this.state !== 'ready') return { status: 503, error: 'WhatsApp is not connected' };
    // Claim before any async work: concurrent duplicate requests cannot send twice.
    this.db.prepare('INSERT INTO sends(request_id,fingerprint,state) VALUES(?,?,?)').run(request_id, fingerprint, 'sending');
    try {
      const recipient = await this.client.getNumberId(to.slice(1));
      if (!recipient) {
        this.db.prepare("UPDATE sends SET state='not_registered' WHERE request_id=?").run(request_id);
        return { status: 422, state: 'not_registered' };
      }
      const message = await this.client.sendMessage(recipient._serialized, body, { sendSeen: false });
      const id = message.id._serialized;
      this.db.prepare("UPDATE sends SET state='submitted',provider_id=? WHERE request_id=?").run(id, request_id);
      return { status: 200, state: 'submitted', provider_id: id };
    } catch {
      // A timeout may happen after the provider accepted the message. Never auto-retry.
      this.db.prepare("UPDATE sends SET state='unconfirmed' WHERE request_id=?").run(request_id);
      return { status: 502, state: 'unconfirmed', error: 'Check conversation before creating another send request' };
    }
  }
  close() { this.db.close(); }
}
