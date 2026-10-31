# Managed scan failure investigation: October 31, 2026

Four scans failed when the sound-consistency reviewer exceeded its 90-second deadline after successfully collecting sound observations. A fifth scan was recorded as interrupted, without a failed provider request. Failed scans released their report allowance correctly.

## Scope and evidence

Checked retained managed-report records and AI diagnostics in the VideoLens production database, Vercel production runtime logs, the deployed Git revision, and the corresponding source. The reporting window starts at Toronto midnight, `2026-10-31T04:00:00Z`; collection finished at approximately 22:26 UTC. This covers retained managed scans, not private/BYOK activity or deleted records.

Production `videolens.io` resolves to deployment `dpl_2PaatEt59ExeSbpnT38p38bPJ8DC`, Git revision `39f320efb96e6b9a2e3da7cf13598c693d7f732c`, matching `origin/main` during investigation. All four timeout log records identify this deployment.

Customer identifiers, recording contents, and raw logs are intentionally omitted from this public document.

## Results

- Six retained managed scans: five failed, one complete, none pending. All used local files across three free accounts.
- Four failures were sound requests with `request_timeout`; all 17 speech-transcription and 47 chat requests succeeded. Three other sound requests succeeded. A successful subrequest does not establish that its whole scan completed.
- Three timeout-affected scans used UX mode and one used general mode. One UX scan failed on its first sound chunk; two completed a sound chunk before a later chunk failed.
- The fifth failure was client-reported as `interrupted` after about 90 seconds. Its transcription and 20 chat calls succeeded. Another scan on that account began before the interrupted scan ended and completed successfully. This does not establish why the first scan was interrupted.

Each timeout follows an explicit `Managed sound observations ready` log with 30 windows. The interval to `Managed sound operation failed` is approximately 90 seconds:

| Timeout sequence | Observations ready, UTC | Failure, UTC | Recorded sound-operation duration |
| --- | --- | --- | --- |
| 1 | 10:30:06.159 | 10:31:36.166 | 167.013 s |
| 2 | 10:36:40.062 | 10:38:10.067 | 175.735 s |
| 3 | 10:53:00.685 | 10:54:30.687 | 227.379 s |
| 4 | 16:54:17.208 | 16:55:47.212 | 217.818 s |

This localizes the failures to the final consistency review, rather than speech transcription or initial sound-window observation. Retained diagnostics do not establish why the upstream reviewer was slow; do not infer a provider outage, billing problem, or specific hardware cause.

## Why existing recovery did not work

`site/api/_lib/sound.ts` makes two independent observations per non-silent two-second window, with five workers. It then submits every window's pair to one structured text review through `xiaomi/mimo-v2.6-flash`, restricted to DeepInfra via Vercel AI Gateway.

The observation deadline is 40 seconds; review is 90 seconds; the overall sound-operation deadline is 240 seconds. `withCallDeadline` retries once only if another full call fits before its 235-second guard. For these four cases, review began approximately 77, 86, 137, and 128 seconds into processing. By the first review timeout, another 90-second attempt no longer fit. The October 30 retry change therefore does not recover this workload.

The local-file pipeline awaits sound analysis before report synthesis. A failed sound chunk rejects the scan, including any earlier sound chunks that completed. The API returns HTTP 502 and a generic retry message; client diagnostics flatten this into `analysis`, hiding the specific review timeout in the activity summary.

## Allowance verification

Checked the deployed `get_managed_entitlement` function: only `pending` and `complete` reports consume allowance. The two accounts with timeout failures each show zero used and three remaining. The account with one interruption and one completion shows one used and two remaining. No manual credit adjustment is needed for these failures.

## Recommended repair and acceptance

1. Replace the single large review with bounded batches, preserving both independent observations, agreement checks, and exact window coverage. Reserve sufficient review time within the existing operation and function limits. Measure latency before increasing timeouts or concurrency.
2. Add deterministic tests with 30 non-silent windows, slow observations, review deadline exhaustion, and failure in a later chunk. Existing deadline tests primarily exercise one sound window, which does not represent these failures.
3. Record the failing sound substage and safe timing/window-count diagnostics. Preserve actionable timeout categories through the API and client recovery message.
4. If adding a visual-only continuation, make audio incompleteness explicit and preserve the option to retry sound. Do not silently claim complete audio coverage or replace an unreviewed window with a confident conclusion.
5. Verify a real authenticated local-file scan longer than 60 seconds in both Chrome and Firefox, including sound coverage, report synthesis, export, and failure/allowance recovery. If extension behavior changes, use the same release version and complete the repository's dual-store release contract.

No runtime, database, provider configuration, store release, or customer communication was changed during this investigation. No paid model probes were run. Source/log correlation and live entitlement reads establish this diagnosis; a repaired end-to-end flow remains unverified. Client version and browser target were unavailable in these retained records.

## Repository handling

The original `codex/pro-model` checkout is dirty and 113 commits behind the verified production/default branch. It was preserved. Available Codex thread inventory showed no other active VideoLens thread besides this investigation, but cannot rule out unpublished work on another machine. This document was prepared on an isolated branch based on the verified production revision.
