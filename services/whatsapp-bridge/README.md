# EZfix linked-device WhatsApp bridge — development stage

Standalone QR-linked provider adapter. **Not deployed or connected to the CRM yet.**
No live WhatsApp account has been paired, and no real message has been sent during tests.
Existing Cloud API functions and CRM styling remain untouched.

## Host requirements

A continuously running Windows, macOS or Linux computer with Node 22.13+,
Chromium/Chrome, persistent private storage and outbound network access.
Run as an ordinary user with Chromium sandbox enabled. This is a long-lived
browser process, not a Vercel request handler. Do not host the live account in a
transient development workspace. whatsapp-web.js is an unofficial client.

## Install / start on the selected host

```
npm ci
npm start
```

`npm ci` downloads the browser through Puppeteer. Alternatively set
`PUPPETEER_SKIP_DOWNLOAD=true` during installation and set `WA_CHROME_PATH` to
an installed compatible Chrome executable. `WA_DATA_DIR` overrides `./data`.
The directory holds credentials, browser session and the SQLite message database;
restrict it to the operating-system user running the bridge. Never commit it.

The service listens on loopback port 8787 (`WA_PORT` overrides). Every endpoint
requires `Authorization: Bearer <contents of data/bridge-token>`. Tokens and QR
codes are not logged. Browser cross-origin requests are rejected. Do not publish
this port or put the bridge token in the CRM frontend.

- `GET /status`: lifecycle state; only `ready` permits sending.
- `GET /qr`: current QR as a PNG data URL, or null. Pair using WhatsApp → Linked devices.
- `GET /events?after=0`: up to 100 durable ordered message/ack events; save the
  last consumed sequence in the receiving connector after successful ingestion.
- `POST /send`: `{request_id,to,body}`. Use a stable unique request ID (16–100
  alphanumeric/underscore/hyphen characters) and E.164 recipient. Duplicate IDs
  never resend, even after restart. Changed payload with reused ID returns 409.
  `submitted` does NOT mean delivered. Provider acknowledgments are separate events.
  An ambiguous failure remains `unconfirmed`; inspect the conversation before retrying.

Direct text conversations only in this first adapter. No group ingestion, media
handling, historical backfill, automatic Ashley replies or recipient discovery.
Opaque WhatsApp `@lid` identities are preserved as chat IDs, never treated as
telephone numbers. Events are deduplicated by provider message ID.

## Remaining before a live CRM release

1. Select and provision the durable host, install the service and pair the account.
2. Connect an authenticated server-side relay to Supabase with office-only
   pairing/send access; add durable cursor tracking and provider event deduplication.
   Do not feed this token to browsers or reuse Meta's signed webhook endpoint.
3. Wire the existing Communications surface to the relay without a visual redesign.
4. Verify incoming message → correct lead, manual reply → handset, delivery status,
   reconnect, restart, cancellation, authorization and duplicate request behavior.
5. Enable Ashley only after manual round-trip passes, with existing CRM action permissions.

`npm test` exercises a fake provider and temporary databases. It does not prove
live WhatsApp compatibility or delivery. A service restart restores a saved session;
a revoked session still requires pairing again. Use host service supervision and
protected backups before production use. Retention policy is required for live messages.
