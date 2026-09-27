# SuperEZX real call-recording adapter starter

This folder is a provider-neutral reference implementation for SuperEZX. It is not loaded by EZfix CRM runtime.

- `provider-contract.mjs`: normalized recording contract used by core SuperEZX.
- `twilio-recording-adapter.mjs`: first real-recording provider adapter.
- Twilio webhook signature MUST be verified at the HTTP boundary before calling the normalizer.
- Tenant identity MUST come from the authenticated provider connection, never webhook fields.
- Recording credentials stay server-side; normalized events contain no secrets.
- Core SuperEZX stores only normalized call/recording IDs and its own private recording asset.

Twilio is the first provider target because Programmable Voice supports recording callbacks and dual-channel recording. RingCentral can implement the same contract from its Call Log recording metadata/content APIs.

This code is deliberately pure: no live Twilio calls, no secrets and no customer data.
