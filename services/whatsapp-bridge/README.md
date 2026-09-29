# EZfix linked-device WhatsApp bridge — host activation pending

QR-linked provider adapter, authenticated cloud relay and manual CRM inbox.
**No persistent host or live WhatsApp account is connected yet.**
No live WhatsApp account has been paired, and no real message has been sent during tests.
Existing Cloud API functions remain separate. Communications gains a WhatsApp inbox button; Ashley auto-replies remain off.

## Host requirements

A continuously running Windows, macOS or Linux computer with Node 22.13+,
Chromium/Chrome, persistent private storage and outbound network access.
Run as an ordinary user with Chromium sandbox enabled. This is a long-lived
browser process, not a Vercel request handler. Do not host the live account in a
transient development workspace. whatsapp-web.js is an unofficial client.

## Install / start on the selected host

```
npm ci --ignore-scripts
npm start
```

Use a separately installed Chrome and set `WA_CHROME_PATH` to its executable.
Install with `--ignore-scripts` so dependency installation does not download or
launch a browser. `WA_DATA_DIR` overrides `./data`.
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

## Cloud relay and CRM inbox

Apply `20260929181433_whatsapp_linked_device_relay.sql` and deploy the
`whatsapp-linked-device` Edge Function with gateway JWT verification disabled.
The handler independently validates Supabase user tokens and current active team
roles. Its worker protocol authenticates a separate high-entropy private key.
Browser Data API roles have no privileges on the three relay tables; RLS is enabled.
QR access is owner-only. Office roles can view messages and enqueue manual sends.
Technicians and marketing-only users cannot access this inbox.

Configure the same random secret (at least 32 characters) as `WA_LINKED_BRIDGE_KEY`
in Edge Function secrets and `WA_RELAY_TOKEN` in the persistent host environment.
Set `WA_RELAY_URL` to the deployed function's HTTPS URL. Never place either secret
in frontend settings, source control, chat or URLs. Do not open port 8787 to the
internet: the host polls outward to Supabase every five seconds.

Each worker retains its UUID, event cursor and send journal in SQLite. Cloud jobs
are claimed atomically. After a lost response, only the same durable worker can
recover its processing job; the local journal prevents another provider send.
A replacement host must restore the complete private data directory. Do not start
multiple copies from a cloned session. An in-flight job on a lost host requires
manual reconciliation; there is no unsafe automatic failover.

The CRM shows connection state and recent direct text messages, with unique
phone matches linking to an existing lead or customer. Ambiguous matches remain
unlinked. Opaque WhatsApp LIDs are linked only when the provider supplies the exact
LID-to-phone mapping. The view includes up to 300 recent events and 100 recent
outbound requests; it is not a complete historical chat archive. Media, groups,
message edits/deletes and automated lead-dispatch WhatsApp routing are not wired
to this adapter yet. Existing Meta Cloud API notification routes remain unchanged.

Only an explicit office send action creates a command. Incoming message content
never executes instructions. A send retry keeps its original request ID and
payload. Submitted is not delivered; delivery/read acknowledgments are separate.
A heartbeat older than 45 seconds disables new sends. Pairing QR codes are hidden
when stale or already connected.

## Verification and activation checklist

- [x] Fake-provider send deduplication, restart and unknown outcomes.
- [x] Durable relay cursor and recovery after lost cloud acknowledgments.
- [x] Office/technician/owner role boundaries, QR isolation, escaping and stable UI retries.
- [x] Local PostgreSQL checks for RLS, service-only claims and worker ownership.
- [x] Dependency advisory resolved by pinning `@puppeteer/browsers` 3.2.3.
  Provider/Puppeteer imports and executable-path API compatibility pass; npm audit
  reports zero vulnerabilities for the locked dependency tree at verification time.
- [ ] Select a persistent host and set its private environment values.
- [ ] Pair the intended WhatsApp account using its Linked devices screen.
- [ ] Verify real inbound → correct CRM conversation, reply → handset, delivery,
  disconnect/reconnect and host restart. Tests do not prove live compatibility.
- [ ] Agree message retention/backup operations before sustained production use.
- [ ] Add media/history and automated notification routing if required after manual acceptance.

No live account has been paired and no real message was sent during development.
A revoked session still requires pairing again. Use OS service supervision with
an ordinary user and Chromium sandbox enabled; never disable the sandbox to get
a test to run. The host's persistent directory contains authentication and message
data and must remain private to its operating-system account.
