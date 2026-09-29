# EZfix linked-device WhatsApp bridge

QR-linked provider adapter, authenticated cloud relay and manual CRM inbox.
The owner paired the Windows host on September 29, 2026 and confirmed inbound
messages in the CRM and a manual CRM reply on the second handset. See the
activation notes below for remaining operational acceptance.
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
- [x] Select a persistent host and set its private environment values.
- [x] Pair the intended WhatsApp account using its Linked devices screen.
- [ ] Verify real inbound → correct CRM conversation, reply → handset, delivery,
  disconnect/reconnect and host restart. Tests do not prove live compatibility.
- [ ] Agree message retention/backup operations before sustained production use.
- [ ] Add media/history and automated notification routing if required after manual acceptance.

Automated tests use fake providers; the owner performed the separate live sends.
A revoked session still requires pairing again. Use OS service supervision with
an ordinary user and Chromium sandbox enabled; never disable the sandbox to get
a test to run. The host's persistent directory contains authentication and message
data and must remain private to its operating-system account.

## September 29 live activation and compatibility follow-up

- Owner-confirmed inbound CRM receipt, manual reply received on the other phone,
  and another inbound message after the requested process-restart sequence.
- Read-only cloud inspection found a fresh ready heartbeat, five message events,
  and one outbound request marked unconfirmed despite owner-confirmed receipt.
- PR #197 accepts exact provider keys under either `_serialized` or `$1`.
  The SDK itself also needs the narrow result-lookup correction in
  `provider-compat.mjs`: it sends successfully but otherwise queries its message
  collection with a missing legacy key. Server startup prepares the pinned
  1.34.7 dependency before dynamically importing it. Repeated preparation is a
  no-op; an unexpected version/source or preloaded SDK stops startup for review.
- Launch `node --env-file=host.env server.mjs`, not the temporary diagnostic
  wrapper that imports the SDK first. The result-lookup correction needs a new
  owner-performed send to verify its live provider ID and acknowledgment.
  Existing unconfirmed requests are not rewritten or resent.
- Owner reported READY after creating a minimized Windows Startup shortcut with
  the resolved node.exe path, persistent working directory and the command above.
  Actual Windows sign-out/sign-in startup is still unverified. This is a login
  shortcut, not a boot service or crash supervisor. Sleep/offline/crash recovery
  and private session/message backup still require operational acceptance.

The host must stay awake and connected. To update it, stop the running bridge
with Ctrl+C before replacing files, then launch exactly one instance. Do not
remove the data directory or pair another session just to apply this patch.
