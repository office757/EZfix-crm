# Live Supabase Edge Function Source Sync

This source-sync tracks exact source copied from the currently ACTIVE Supabase functions without changing their runtime behavior.

Verified against Supabase project `fylbalenuqpovwncwbah` on 2026-09-23.

## Tracked against the current live deployment

| Function | Live version | Live SHA-256 |
| --- | ---: | --- |
| `send-crm-email` | 12 | `bb317107f1c0218e9c5859347aa4a639f84d6f0e8698e8f0ec4d2a6fa590ce36` |
| `send-inkbox-sms` | 17 | `c111b345ad140bbe531272bcddd762839a7f657e2015164f8dcdb86ece3d9973` |
| `record-website-sms-consent` | 1 | `db553e68a475a909d8b21dda793b1bfc9fd17a8f0ac66b04acb467c6409cee66` |
| `sync-inkbox-calls` | 7 | `466f08617598205c7e698b70bf85f8567f244c917bdcfd066a6315734e7f8de8` |
| `inkbox-webhook` | 12 | `ca78c6452ace9a92eae5c4b172daa4fd3100cafc95b5691b0efb3aeb0396a7d8` |
| `process-inkbox-call-leads` | 11 | `307e03132f3f7eb05268d1598e242ba879cc909dd7c158392747125b3a34b848` |
| `sync-inkbox-events` | 5 | `cefa8e5f7a2def1d0e3daae8d9430a4707616c9a39086c534e6e64f8eb8bc53f` |
| `list-inkbox-events` | 4 | `24bc8850c8ebd387c7c23310169f7929bfdfd7f81cb5c5947116a3d3fd8702ed` |
| `ack-inkbox-event` | 4 | `336de3a1ac41bc8f3c4d4a75542dd695528e2850bc78f9d416fa93e96f06a28d` |
| `ai-manager-tools` | 18 | `d6cf8177bfaf5413c947a35e2338bc03e93301e2a41347d52c21d087e128effa` |

The following were already tracked separately on `main` and should continue to be compared with their active deployment before release:

- `invoice-email-preview`
- `ai-technician-assistant`
- `ai-service-document-approval`

## Live functions still outside this source-sync set

These functions are deployed in Supabase but are not claimed as synchronized by this file. They should be copied from the active deployment in isolated changes rather than reconstructed from memory:

- `invite-team-user` v2
- `send-whatsapp-notification` v1
- `whatsapp-webhook` v1
- `google-ads-readonly` v2
- `supabase-health` v2
- `inkbox-sdk-test` v2
- `website-lead-webhook` v5
- `manage-team-login` v1
- `send-technician-assignment-sms` v1

This file is an audit/source-control note only. It does not deploy, invoke, or alter any live function.