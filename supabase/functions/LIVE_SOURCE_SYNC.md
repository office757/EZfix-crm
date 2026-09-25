# Live Supabase Edge Function Source Sync

This branch tracks exact source copied from the currently ACTIVE Supabase functions without changing their runtime behavior.

Verified against Supabase project `fylbalenuqpovwncwbah` on 2026-09-25.

## Added to source control on this branch

| Function | Live version | Live SHA-256 |
| --- | ---: | --- |
| `send-crm-email` | 15 | `73a9e83bb437350f82ba5e35f1ee78219721103f91aa5a5ce11b57b8f2e5b81d` |
| `send-inkbox-sms` | 22 | `409e8de9c4e7b7ef6d010ca404af28deb9eee961a3e482ada62324304ae85993` |
| `record-website-sms-consent` | 3 | `db553e68a475a909d8b21dda793b1bfc9fd17a8f0ac66b04acb467c6409cee66` |
| `sync-inkbox-calls` | 9 | `466f08617598205c7e698b70bf85f8567f244c917bdcfd066a6315734e7f8de8` |
| `inkbox-webhook` | 14 | `ca78c6452ace9a92eae5c4b172daa4fd3100cafc95b5691b0efb3aeb0396a7d8` |
| `process-inkbox-call-leads` | 14 | `d68ffe5e52a28ceb724e24c3bd28fce82672642042cd0ab5c66fd252c00fdd13` |
| `sync-inkbox-events` | 7 | `cefa8e5f7a2def1d0e3daae8d9430a4707616c9a39086c534e6e64f8eb8bc53f` |
| `list-inkbox-events` | 6 | `24bc8850c8ebd387c7c23310169f7929bfdfd7f81cb5c5947116a3d3fd8702ed` |
| `ack-inkbox-event` | 6 | `336de3a1ac41bc8f3c4d4a75542dd695528e2850bc78f9d416fa93e96f06a28d` |
| `ai-manager-tools` | 24 | `5ee2fa373f5d1b4c24e90f33d8ae79b048bdd947046ae61b150d63c2c771bf50` |
| `google-ads-readonly` | 4 | `c9333939f5368716417cd07cbcfbe47523492ea0c8fdd73d536c4246b7bf69b6` |

## Already tracked on `main`

- `invoice-email-preview`
- `ai-technician-assistant`
- `ai-service-document-approval`

## Still deployed live but not source-synced by this branch

The following live functions remain outside this source-sync change and should be copied from the active Supabase deployment in a later isolated change rather than reconstructed from memory:

- `invite-team-user` v2
- `send-whatsapp-notification` v1
- `whatsapp-webhook` v1
- `supabase-health` v2
- `inkbox-sdk-test` v2

This file is intentionally a source-control audit note. It does not claim that unlisted functions are unused, and it does not deploy, invoke, or alter any live function.