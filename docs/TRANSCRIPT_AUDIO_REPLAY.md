# AI transcript audio replay

## Current verified status — September 28, 2026

This section supersedes the historical phase-1 notes below.

- Production frontend baseline: `3356598`; Vercel production is READY.
- The replacement server-side OpenAI key passed a fixed synthetic speech test
  (HTTP 200, PCM output). The earlier `billing_not_active` result is historical.
- A full replay attempt then found a separate production defect: `crm-assets`
  accepted images/PDFs only, so the generated WAV failed to upload.
- The bucket was repaired through the Storage API by adding only `audio/wav`.
  Existing MIME types, private visibility, RLS policies, and the 15 MiB file limit
  were preserved. No credentials, original recordings, or transcripts were changed.
- `generate-transcript-replay` v5 adds a storage preflight before claiming a call
  or requesting paid speech. A missing/unavailable/public bucket or a MIME list
  excluding WAV now returns a fixed error before generation starts.
- One existing failed call was retried after the repair. The worker returned
  HTTP 200 / `ready`. Its private Storage object exists: 4,856,684 bytes,
  101.18 seconds, with two distinct speakers in the generated cue metadata.
- This is synthetic transcript speech, not an original phone recording.
- Seven actual-handler preflight regression checks pass. The full release
  runner passes all 35 steps, including the existing 46 speech-core checks.
- The temporary diagnostic/repair function was restored to its JWT-protected
  HTTP 410 stub, with no secret access or outbound requests.
- Owner sign-in completed securely. The production Call History player loaded
  the 101.18-second sample, reported no audio error, and advanced while playing.
  The synthetic disclosure and separate original-recording state were visible.
- Existing cron job 8 was resumed. At 06:21 UTC, four calls were ready, nine
  pending and none failed; scheduled processing had advanced beyond the sample.
  Word-by-word listening fidelity and iPhone/iPad playback remain unverified.

The existing 15 MiB bucket limit and 120-second worker deadline still apply;
long-call processing and atomic daily spending reservations are not certified
by this fix. Do not interpret the existing successful-output count as a strict
monetary budget or a concurrent-attempt limit.

### Reproducing the bucket repair

Use the authorized server-side Storage API: read `getBucket('crm-assets')`,
require `public === false`, preserve its current `file_size_limit` and MIME list,
then call `updateBucket` with `public: false`, the preserved file limit, and
`allowedMimeTypes` containing the existing types plus `audio/wav`. Read it back.
Never expose a service key or make this a public browser operation.

References: [Storage bucket update](https://supabase.com/docs/reference/javascript/file-buckets-updatebucket)
and [OpenAI text to speech](https://developers.openai.com/api/docs/guides/text-to-speech).

## Historical phase-1 design (superseded status)

Requested September 27, 2026: automatically read completed Inkbox call transcripts
with a consistent Ashley voice and a different customer voice, without waiting
for Inkbox to offer original call recordings.

## Implemented and locally tested

- Pure Node/Deno shared planner and renderer, plus a server-only OpenAI PCM adapter.
- Requires explicit, verified party-to-speaker mapping; never guesses from names,
  timing, turn alternation or call direction. Stock voices are casting choices.
- Exact source text is passed to speech generation, preserving segment order.
  No summary-to-dialogue generation, invented words, voice cloning or tone claims.
- A spoken disclosure is included in output. Every output is explicitly
  `synthetic_transcript_audio`, with `isOriginalRecording: false`.
- Distinct stock voice defaults: Ashley `coral`, customer `alloy`. Customer voice
  can be explicitly changed. Audition Ashley's voice before production acceptance.
- SHA-256 source revision, bounded text/chunk counts and PCM output, WAV assembly,
  generated-time cues linked to source dates, cancellation, fixed TTS endpoint,
  redirect rejection, bounded streaming and generic upstream errors.
- No automatic retry of billable speech calls.
- 46 local tests pass using synthetic text and mocked PCM/fetch. No live audio
  quality test, production runtime test, billing test or full release suite run.

## Production integration still REQUIRED

This module is NOT imported by the live sync/webhook/UI and does not create a
complete automatic pipeline by itself. Do not describe it as deployed or ready.

1. Verify actual Inkbox `party` values using read-only metadata, then configure
   the explicit party map. Missing or third-party speakers need review, not guessing.
2. Configure the speech service through secure server credentials. A secure key
   setup flow was opened; no key was installed or exposed in chat/source code.
3. Add an authorized, durable worker/queue. Enqueue only completed calls with a
   stable transcript revision. Use an atomic unique claim keyed by call ID,
   source hash and pinned model revision. Persist checkpoints to avoid unnecessary
   duplicate charges. Set an owner-approved spending cap before automatic mode.
4. Store output privately in a SEPARATE synthetic asset/table/path. NEVER overwrite
   `calls.recording_asset`, original recording URLs, original timestamps or
   transcript text; never count synthesized audio as an original recording.
5. Enforce existing call access in the database and signed audio URL endpoint.
   No public storage, browser API keys or client-supplied arbitrary transcript IDs.
6. Add an explicitly labeled 'AI transcript replay — not original recording'
   player in Call History with queued/processing/ready/failed/stale states. Keep
   original recording and AI replay as separate controls. The spoken disclosure
   must remain in exported audio. Do not claim synthetic timing is real call timing.
7. Validate a permitted sample end to end: actual TTS, words/numbers fidelity,
   both voices, private storage, iPhone/iPad playback, failed-call handling,
   duplicate webhook/cron execution, access denial and transcript revision changes.

## Run local tests

    node --test scripts/audit-transcript-replay.mjs

The PCM fixtures are test bytes, NOT generated speech. No customer transcripts
were sent to OpenAI, no paid TTS call was made, and production was not modified.

## Verified references

Existing source on `559a77f1`: `supabase/functions/sync-inkbox-calls/index.ts`
already stores transcript segments as `{party, text, createdAt}`.

OpenAI API documentation inspected September 27, 2026:
- https://developers.openai.com/api/docs/guides/text-to-speech
- https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create

The adapter pins `gpt-4o-mini-tts-2025-12-15` and requests PCM s16le mono 24kHz.
No runtime SDK dependency was added. Speech generation may still mispronounce or
omit text; live listening/quality validation remains an acceptance requirement.
