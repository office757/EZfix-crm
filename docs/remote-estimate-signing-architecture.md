# Remote Estimate Signing — Safe Architecture

Status: design-ready, not deployed. This branch intentionally contains no production database mutation.

## Existing CRM facts
- Estimates already persist `signature` as JSONB and use `row_version`.
- A signed estimate can currently still be edited, so a remote signature must be bound to the exact commercial snapshot that the customer reviewed.
- The existing public-invoice token boundary is the model: random token, SHA-256 hash at rest, expiry/revocation, RLS, and narrowly scoped RPCs.

## Data model
Create `public.public_estimate_signing_tokens` with:
- `id uuid primary key default gen_random_uuid()`
- `estimate_id text not null references public.estimates(id) on delete cascade`
- `token_hash text not null unique`
- `expires_at timestamptz not null`
- `created_by_team_id text references public.team(id)`
- `issued_row_version bigint not null`
- `estimate_snapshot_hash text not null`
- `created_at timestamptz not null default now()`
- `used_at timestamptz null`
- `revoked_at timestamptz null`

Enable RLS and expose no direct client policies. Service-role/RPC access only.

## Canonical snapshot
Hash only customer-visible commercial fields using a stable canonical serializer:
`estimate id/number + customer identity shown on document + items + tax_rate + discount + deposit_required + due_term + notes shown to customer`.

Do not hash volatile operational fields such as `updated_at`.

## RPC boundary
1. `issue_public_estimate_signing_token(estimate_id)`
   - authenticated only
   - owner/admin/dispatcher/office; technician only when scoped to an assigned job/estimate
   - generate 32 random bytes, return 64-hex raw token once
   - store only SHA-256 hash
   - store current `row_version` and snapshot hash
   - short expiry by default; issuing a new link may revoke older unused links

2. `get_public_estimate_signing_page(estimate_id, access_token)`
   - callable by anon
   - validate 64-hex token before hashing
   - require non-revoked, unused, unexpired record
   - return only safe customer-facing estimate fields
   - return server-computed snapshot hash/version; never expose internal notes, credentials, margins, payroll, or unrelated CRM data

3. `sign_public_estimate(estimate_id, access_token, signer_name, signature_data_url, consent_version)`
   - callable by anon
   - validate token and lock token + estimate row in one transaction
   - recompute canonical snapshot hash
   - reject if `row_version` or snapshot differs from issuance
   - validate signature payload type/size
   - write `signature` plus immutable metadata: signed_at, signer_name, source=remote, issued_row_version, signed_snapshot_hash, consent_version
   - mark token `used_at`
   - append audit event `estimate_signed_remote`
   - idempotent retry returns the already-signed result; it must not create a second signature

## Signed-document integrity
Recommended default: commercial edits invalidate the prior signature rather than silently preserving it.

On UPDATE of a signed estimate, if any hashed commercial field changes:
- clear/invalidate the customer signature in the same database transaction
- set an explicit `signature_invalidated_at/reason` in app_data or a dedicated audit record
- revoke unused signing tokens
- append `estimate_signature_invalidated`
- require a new signing link before status can be treated as customer-approved

Alternative stricter mode: reject commercial edits while signed until an authorized user explicitly chooses “Revise estimate,” which first invalidates the signature. This can be added after UX review.

## Public page UX
- EZfix branding, estimate number, customer, line items, subtotal/tax/discount/total/deposit and terms
- clear Review & Sign action
- signer name + signature pad + consent sentence
- success state with signed timestamp and printable/downloadable copy
- expired/changed links show a safe “This estimate changed or the link expired. Request a new link.” message
- `noindex,nofollow`; no CRM navigation
- mobile-first layout, 44px touch targets, keyboard-accessible signature controls/fallback

## Email flow
Estimate email gets a “Review & Sign Estimate” button using the tokenized public URL. The raw token is only in the URL delivered to the customer and is never stored in plaintext in the database or logs.

## Tests required before deployment
- valid token can read only its estimate
- wrong/expired/revoked/used token denied
- token for estimate A cannot sign estimate B
- edit after issuance causes stale-sign rejection
- signed snapshot survives non-commercial edits
- commercial edit invalidates signature
- concurrent double-sign is idempotent
- oversized/non-image signature rejected
- anonymous caller cannot enumerate estimates
- technician cannot issue link for unassigned estimate
- audit events contain IDs/status but never raw token/signature image
- existing in-person signature remains compatible

## Rollout
1. Create migration using Supabase migration tooling.
2. Compile migration inside BEGIN/ROLLBACK against live schema.
3. Add static security-contract audit assertions.
4. Add public signing Edge/page route.
5. Add email button and CRM status indicator.
6. Run CRM safety, receptionist, security, mobile, and signing-specific tests.
7. Preview only.
8. Merge/deploy only after explicit approval.
