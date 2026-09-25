# Live Supabase Edge Function Source Sync

This repository tracks the currently ACTIVE Supabase Edge Function source without changing runtime behavior.

Verified against Supabase project `fylbalenuqpovwncwbah` on 2026-09-25.

## ACTIVE production inventory

| Function | Version | JWT | Live SHA-256 |
| --- | ---: | :---: | --- |
| `inkbox-webhook` | 14 | no | `ca78c6452ace9a92eae5c4b172daa4fd3100cafc95b5691b0efb3aeb0396a7d8` |
| `hyper-action` | 5 | yes | `84b23d68498a828874cd78349934acbefcdae561de55dfd86f293eca30c9c895` |
| `send-inkbox-sms` | 22 | yes | `409e8de9c4e7b7ef6d010ca404af28deb9eee961a3e482ada62324304ae85993` |
| `list-inkbox-events` | 6 | yes | `24bc8850c8ebd387c7c23310169f7929bfdfd7f81cb5c5947116a3d3fd8702ed` |
| `ack-inkbox-event` | 6 | yes | `336de3a1ac41bc8f3c4d4a75542dd695528e2850bc78f9d416fa93e96f06a28d` |
| `supabase-health` | 4 | no | `7cf97ec934ddb498897e08e6b9231cde7946e4043ef63e3ca3fa36b08d5d4b6d` |
| `sync-inkbox-events` | 7 | yes | `cefa8e5f7a2def1d0e3daae8d9430a4707616c9a39086c534e6e64f8eb8bc53f` |
| `sync-inkbox-calls` | 9 | yes | `466f08617598205c7e698b70bf85f8567f244c917bdcfd066a6315734e7f8de8` |
| `process-inkbox-call-leads` | 14 | yes | `d68ffe5e52a28ceb724e24c3bd28fce82672642042cd0ab5c66fd252c00fdd13` |
| `send-crm-email` | 15 | yes | `73a9e83bb437350f82ba5e35f1ee78219721103f91aa5a5ce11b57b8f2e5b81d` |
| `ai-manager-tools` | 24 | yes | `5ee2fa373f5d1b4c24e90f33d8ae79b048bdd947046ae61b150d63c2c771bf50` |
| `invoice-email-preview` | 12 | yes | `dfb53740ecb66ae58f7c5f68e52d5c61e28a56efaa37ffa4417ae04e3baefe1d` |
| `invite-team-user` | 4 | yes | `378f65ed7afdf6d791ec96d577ffb95b594acb1740d9c037a1dfbd9fc86cce9c` |
| `send-whatsapp-notification` | 4 | yes | `4c12f6d4f97980ed0cb7f28ca238dc53ae97d85ec3dd4d3f51bba87258757a0a` |
| `whatsapp-webhook` | 10 | no | `99bba9393f08d95ffdd4045af5ab038a84461bb71455fbc01f497fddd67bae97` |
| `record-website-sms-consent` | 3 | no | `db553e68a475a909d8b21dda793b1bfc9fd17a8f0ac66b04acb467c6409cee66` |
| `google-ads-readonly` | 4 | yes | `c9333939f5368716417cd07cbcfbe47523492ea0c8fdd73d536c4246b7bf69b6` |
| `ai-technician-assistant` | 10 | yes | `76ab88eb233820cb75ab2e7dd1305ecc79a641e0d5c3d81cd3880b3bbe96b1f8` |
| `ai-service-document-approval` | 8 | yes | `4874e25e50047aa656036477aea3f3427d2bc709fcd5ad68a7d3a35896de6681` |
| `website-lead-webhook` | 11 | no | `5ab669dbc86238f90efc328682178cfd1a4812ae97abbaffc464e082921767a4` |
| `manage-team-login` | 3 | yes | `37a48ec9d62c2e65e581daae3889cbfa5699295d615984cbecc9f52e479ea57e` |
| `send-technician-assignment-sms` | 5 | yes | `48fd57403df57e34042a188c0a0cff59ba4313dbc631729fed1872fc20bb2866` |
| `create-square-payment-link` | 4 | yes | `07f44489812cf388128bddc38442abf8b7cda39a659d779b0fa104045c5c44ce` |
| `sync-square-payment` | 3 | no | `09019d049259a5eb71480dd762c5c5ce46df843916bde9d6839787792721a692` |
| `square-webhook` | 3 | no | `da6addeb8f5ed6b2b921ca6bc35e96a42257c6d22cc9f814f4f13d5c35cd431a` |
| `configure-square-webhook` | 4 | yes | `c9c1a2222dd72dfdfd9b5c63636c1e962d0e60181552cbbb7b2bba21ba429d3b` |
| `mark-receipt-delivery` | 4 | yes | `73ec4eeca15f7b883770ad7dbd39423687ad11b2119d7320049c577a4e6f9b0b` |
| `resend-webhook` | 4 | no | `0b4fcc33f5db9c95ab2a4846162b6086e485c86ccf5e390d5cbd93aa6f520d29` |
| `marketing-connector-readiness` | 3 | yes | `0768c268db37481cd9f59b62ebff9afad9307c5d0fbf910cd66a1a0c8b36d034` |
| `marketing-oauth-start` | 3 | yes | `e9487010b76edd2120adcd985a990f34bb29bb9d3c2672eb3574010395302938` |
| `marketing-oauth-callback` | 4 | no | `7fc5f13206b01df30afe3d30766c93297ec925fa36f8f3fc9cd29d05fe9ad760` |
| `google-ads-discover-accounts` | 3 | yes | `c653d223797b297d42ad17b2741865ae62be3110ee4d9d8fcf6213de482e1b24` |
| `marketing-integration-status` | 2 | yes | `dc17a5aca80470d9a3e4513bb84dfa22437c303f8b3ad401d3b4da5c6320b23d` |
| `google-ads-select-account` | 1 | yes | `ae1c70f1aa22825661562878ba15787ab4f6e1d0454b53258269c4cf195c3e29` |
| `google-ads-sync-readonly` | 2 | yes | `440823e38b71974fbc66285a38348e65135626761290a022770af706b127f169` |
| `ai-approval-decision` | 2 | yes | `68784cc7549ed1aed1f81a941588a2e25d386ed15110bc5a8c1584471b090263` |
| `ai-service-document-execute` | 2 | yes | `125c6313231f75ac8c306677d167c8a742e5b178d39a37c0a7707bb1e651954c` |

## Source-sync status

All 37 ACTIVE Edge Function slugs returned by Supabase on 2026-09-25 are represented under `supabase/functions/` with an `index.ts`.

This manifest is a source-control audit record. Source synchronization does not redeploy or invoke live functions.
