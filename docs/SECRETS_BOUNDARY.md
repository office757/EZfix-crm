# EZfix CRM — Environment & Secrets Boundary

Last verified: 2026-09-25

## Rule

The browser/frontend may contain only public configuration required to connect to Supabase:

- `SUPABASE_PROJECT_URL`
- `SUPABASE_ANON_KEY` / publishable key

All privileged credentials must remain server-side in Supabase Edge Function environment variables or other managed secret stores.

## Server-only secrets

These names are treated as privileged and must never be embedded in HTML/client JavaScript:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_LOCATION_ID`
- `INKBOX_API_KEY`
- `INKBOX_SIGNING_KEY`
- `META_WHATSAPP_TOKEN`
- `META_APP_SECRET`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `RESEND_API_KEY`
- `WEBSITE_SMS_CONSENT_TOKEN`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

## Current architecture

- The production browser uses a Supabase publishable key, not service-role credentials.
- Edge Functions retrieve privileged values with `Deno.env.get(...)`.
- Square API calls are server-side.
- Inkbox API/signature verification is server-side.
- Meta WhatsApp send token and webhook app secret are server-side.
- Google OAuth client secret and Ads developer token are server-side.
- Resend API access is server-side.
- Public webhooks that cannot use Supabase JWT implement provider/custom authentication in the function body.

## Rules for future changes

1. Never add a privileged secret to `index.html`, `auth-shell.html`, `team-admin.html`, `set-password.html`, or any other browser-delivered asset.
2. Never prefix a secret with `NEXT_PUBLIC_` or otherwise expose it to the client bundle.
3. Secret values must not be committed to Git, PR descriptions, logs, screenshots, audit fixtures, or test output.
4. Edge Functions should read secret values at runtime from managed environment variables.
5. Provider readiness checks may return booleans and missing variable **names**, but never secret values.
6. If a provider credential is rotated, redeploy only functions that need the credential if required; do not change browser code.
7. Treat Supabase publishable/anon keys as public identifiers protected by RLS, not as authorization secrets.
8. Treat `service_role` as highly privileged and never make it reachable from browser code.
9. Keep webhook signing secrets private even when the webhook endpoint itself must be public.
10. If a secret is ever committed, assume compromise: revoke/rotate it first, then remove it from history.

## Verification status

Repository scan on 2026-09-25 found no hardcoded JWT, Square, OpenAI-style, or Meta access-token literals. A Meta-pattern hit in `index.html` was verified to be a false positive inside base64-encoded logo image data.

The browser Supabase key was classified without printing its value and is in the `sb_publishable_` format.

The local Vercel CLI is not currently authenticated, so this audit does not claim to enumerate Vercel production environment-variable names or values. Runtime configuration remains verified through deployed function behavior and server-side source boundaries.
