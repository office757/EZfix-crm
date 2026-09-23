# Live Supabase Edge Function Source Sync

This branch tracks exact source copied from the currently ACTIVE Supabase functions without changing their runtime behavior.

Verified against Supabase project `fylbalenuqpovwncwbah` on 2026-09-23.

## Added to source control on this branch

| Function | Live version | Live SHA-256 |
| --- | ---: | --- |
| `send-crm-email` | 12 | `bb317107f1c0218e9c5859347aa4a639f84d6f0e8698e8f0ec4d2a6fa590ce36` |
| `send-inkbox-sms` | 15 | `cd0dfd30e47c5f88ab5a9c4494a7af63644b6ebec6c5af829f7096a55b28b49e` |
| `sync-inkbox-calls` | 7 | `466f08617598205c7e698b70bf85f8567f244c917bdcfd066a6315734e7f8de8` |
| `inkbox-webhook` | 11 | `dc21fc3cdd4115ad0f2d60a85410e36105b6089e44125669f6564daf19fae4f0` |
| `process-inkbox-call-leads` | 9 | `09a64fdd7743ff069ca92daba11a5bacab6432755bf77f9e18d286da0ecfd8d5` |
| `ai-manager-tools` | 18 | `d6cf8177bfaf5413c947a35e2338bc03e93301e2a41347d52c21d087e128effa` |

## Already tracked on `main`

- `invoice-email-preview`
- `ai-technician-assistant`
- `ai-service-document-approval`

## Still deployed live but not source-synced by this branch

The following live functions remain outside this source-sync change and should be copied from the active Supabase deployment in a later isolated change rather than reconstructed from memory:

- `record-website-sms-consent` v1
- `sync-inkbox-events` v3
- `list-inkbox-events` v4
- `ack-inkbox-event` v4
- `invite-team-user` v2
- `send-whatsapp-notification` v1
- `whatsapp-webhook` v1
- `google-ads-readonly` v2
- `supabase-health` v2
- `inkbox-sdk-test` v2

This file is intentionally a source-control audit note. It does not claim that unlisted functions are unused, and it does not deploy, invoke, or alter any live function.