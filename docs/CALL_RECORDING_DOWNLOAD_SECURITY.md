# Provider recording download boundary

This change builds on PR #150's first-writer-wins persistence. It does not change that implementation, the Call History UI, call/SMS processing, hosted-agent configuration, or database permissions.

## Before enabling real provider downloads

Set the server-side Supabase Edge Function environment variable `INKBOX_RECORDING_ALLOWED_HOSTS` to comma-separated **exact provider-controlled DNS hostnames confirmed by Inkbox**. Do not enter a URL, wildcard, IP address, broadly shared hosting domain, customer-controlled domain, or anything copied blindly from caller text. No hostname is guessed or approved by default. No secret or signed download URL belongs in this setting or in GitHub.

An empty/malformed allowlist intentionally prevents external audio downloads. Call records and transcripts still sync, and already attached recordings remain untouched. This is a one-time provider integration setting, not a manual action per call. Actual provider audio, its field mapping, ownership of its host, consent/disclosure behavior, and end-to-end playback are still unverified.

## Enforced boundary

- HTTPS only; exact host approval; no userinfo, unusual port, fragment, whitespace/control characters, or IP literals.
- Do not follow redirects. Obtain the provider's direct signed download URL; request a documented integration change if it requires redirects or header authentication.
- No API key, cookies, Authorization or Referer are forwarded to the audio host.
- Only successful complete responses with an explicitly supported audio/media MIME type are accepted. A filename suffix does not authorize HTML, JSON, unknown, or octet-stream data. If Inkbox uses octet-stream, review and test that contract before allowing it.
- Basic binary format signatures reject obvious mislabeled data. This is not a full media decoder, antivirus scanner or guarantee of playability.
- 100 MiB hard limit is enforced as stream chunks arrive, including when Content-Length is missing or false. Header-fetch and body-read deadline: 15 seconds. Cancellation and reader cleanup run on failure.
- Errors from this downloader contain only fixed codes, not raw signed URLs or provider response bodies.
- Upload and the existing atomic attachment step only run after a successful validated download. Existing manual/winning assets remain authoritative.

## Operational limitations

Only approve stable provider-controlled DNS names with public destinations. This application allowlist is not a network egress firewall or DNS pinning implementation; infrastructure-level egress controls are complementary. A compromised approved provider host/DNS is outside this helper's trust boundary. Browser playback of existing `recording_url` values is unchanged by this server-download-only patch.

The worker's existing `synced` count describes saved call records, not successful audio downloads. A missing host configuration must not be reported as a completed recording integration. No historic audio or consent is fabricated.

## Verification

`node scripts/audit-recording-download.mjs` runs 32 transport/validation cases plus four worker call-site assertions. The release runner also retains the 14-case recording-persistence regression suite. All transport fixtures are local/synthetic; no provider calls, production storage writes, customer data changes, or live messages are performed by these tests.

Design references: OWASP SSRF Prevention Cheat Sheet (exact allowlists and disabling redirects); Deno Fetch and Streams API documentation (streaming body and cancellation). A successful test suite is not a substitute for verifying real provider audio.
