# Live Supabase Edge Function Source Sync

This source-sync tracks exact source copied from the currently ACTIVE Supabase functions without changing their runtime behavior.

Verified against Supabase project `fylbalenuqpovwncwbah` on 2026-09-23.

## Tracked against the current live deployment

| Function | Live version | Live SHA-256 |
| --- | ---: | --- |
| `send-crm-email` | 13 | `bb317107f1c0218e9c5859347aa4a639f84d6f0e8698e8f0ec4d2a6fa590ce36` |
| `send-inkbox-sms` | 18 | `c111b345ad140bbe531272bcddd762839a7f657e2015164f8dcdb86ece3d9973` |
| `record-website-sms-consent` | 2 | `db553e68a475a909d8b21dda793b1bfc9fd17a8f0ac66b04acb467c6409cee66` |
| `sync-inkbox-calls` | 8 | `466f08617598205c7e698b70bf85f8567f244c917bdcfd066a6315734e7f8de8` |
| `inkbox-webhook` | 13 | `ca78c6452ace9a92eae5c4b172daa4fd3100cafc95b5691b0efb3aeb0396a7d8` |
| `process-inkbox-call-leads` | 13 | `d68ffe5e52a28ceb724e24c3bd28fce82672642042cd0ab5c66fd252c00fdd13` |
| `sync-inkbox-events` | 6 | `cefa8e5f7a2def1d0e3daae8d9430a4707616c9a39086c534e6e64f8eb8bc53f` |
| `list-inkbox-events` | 5 | `24bc8850c8ebd387c7c23310169f7929bfdfd7f81cb5c5947116a3d3fd8702ed` |
| `ack-inkbox-event` | 5 | `336de3a1ac41bc8f3c4d4a75542dd695528e2850bc78f9d416fa93e96f06a28d` |
| `ai-manager-tools` | 19 | `d6cf8177bfaf5413c947a35e2338bc03e93301e2a41347d52c21d087e128effa` |

The live version numbers above may advance without a source-hash change when a function is redeployed unchanged. The SHA-256 is the source-integrity signal; both version and hash are recorded so release audits can distinguish an unchanged redeploy from real source drift.

The following are tracked separately on `main` and should continue to be compared with their active deployment before release:

- `invoice-email-preview` — live v9, SHA-256 `9c74be6e0db8a505cda48c720d4c75056dc65d949ab59d4af5b03e8840f3f5e0`
- `ai-technician-assistant` — live v9, SHA-256 `76ab88eb233820cb75ab2e7dd1305ecc79a641e0d5c3d81cd3880b3bbe96b1f8`
- `ai-service-document-approval` — live v6, SHA-256 `0f374ad7aed005a2a442481a1968952560407be384c1581b54f724738b965f67`

## Live functions still outside this source-sync set

These functions are deployed in Supabase but are not claimed as synchronized by this file. They should be copied from the active deployment in isolated changes rather than reconstructed from memory:

- `invite-team-user` v3
- `send-whatsapp-notification` v2
- `whatsapp-webhook` v3
- `google-ads-readonly` v3
- `supabase-health` v3
- `inkbox-sdk-test` / slug `hyper-action` v3
- `website-lead-webhook` v6
- `manage-team-login` v2
- `send-technician-assignment-sms` v2

This file is an audit/source-control note only. It does not deploy, invoke, send customer communications, charge/refund a payment, or alter any live function.