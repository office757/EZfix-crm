# AI transcript audio replay — phase 1, NOT LIVE

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
