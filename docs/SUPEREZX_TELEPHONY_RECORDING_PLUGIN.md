# SuperEZX telephony recording plugin architecture

SuperEZX treats telephony as a replaceable provider adapter, not hard-coded CRM logic.

## Provider contract

```ts
interface TelephonyRecordingProvider {
  provider: string;
  connectBusiness(input): Promise<Connection>;
  provisionOrAttachNumber(input): Promise<PhoneNumber>;
  normalizeCallWebhook(request): Promise<NormalizedCallEvent>;
  normalizeRecordingWebhook(request): Promise<NormalizedRecordingEvent>;
  fetchRecording(recordingId): Promise<ReadableStream>;
  verifyWebhook(request): Promise<boolean>;
  disconnectBusiness(connectionId): Promise<void>;
}
```

Core recording event: tenant_id, provider, provider_call_id, provider_recording_id,
status, duration_sec, channels, created_at, and a provider recording reference.

## Primary provider: Twilio Programmable Voice

Twilio is the first production adapter. Its official Voice Recordings API supports
recordings, WAV/MP3 retrieval, and RecordingStatusCallback webhooks carrying
CallSid, RecordingSid, RecordingUrl, status, duration, channels and track.
Dual-channel two-party recording is supported.

SuperEZX flow:
1. Connect a business to its Twilio account/subaccount.
2. Attach/provision a phone number.
3. Tenant policy controls whether calls are recorded.
4. Twilio posts RecordingStatusCallback to the SuperEZX webhook.
5. The Twilio adapter validates the provider signature and emits a normalized event.
6. A worker downloads the audio with server credentials into tenant-private Storage.
7. Core Call History reads only the normalized asset, so providers remain swappable.

## Secondary option

RingCentral is a strong option for businesses already on RingCentral and exposes
recording workflows in its phone ecosystem. A RingCentral Phone connector is
available for ChatGPT workflows. The SuperEZX SaaS itself should still integrate
through the same provider-adapter contract rather than coupling core CRM logic to it.

## Tenant controls

Recording on/off, jurisdictional disclosure/consent configuration, retention,
delete/export, provider connection status, webhook health, private storage and encryption.

Synthetic Transcript Replay remains a separate optional feature and must never be
represented as the original recording.
