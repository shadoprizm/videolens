# Local-file decoder recovery, 0.8.2

The local-file reader previously imposed a three-second seek deadline, listened only for `seeked`, and then waited for a paint callback. Initial-frame decoding may instead notify through `loadeddata`; a detached/background media element must not need a screen paint before capture can continue.

The reader now waits for current-frame data, observes multiple media events, polls readiness, and retains a 30-second stall guard. One decoder restart retries the failed timestamp within the existing report operation, retaining earlier frames. Opening and closing a local video releases its listeners, source and object URL. General local-file reports use the selected frame budget across the recording; recipe and software-tutorial samplers remain specialized.

## Verification on 2026-10-28

- `npm run release:check`: typecheck, 109 tests, both browser packages and Firefox reviewer source passed. Firefox lint: zero errors, warnings or notices.
- Exact original [400 SB Crash WebM](https://commons.wikimedia.org/wiki/File:400_SB_Crash.webm), 17.585 seconds, AV1/Opus, 1920 x 1080: actual local-file reader captured 40 JPEG frames in isolated Chrome (13.412 seconds) and Firefox (16.278 seconds) browser harnesses.
- Controlled compositor-free test on that file: the previous reader failed to complete within 25 seconds despite decoded data being ready. The updated reader captured all 40 frames in 9.016 seconds with paint callbacks suppressed.
- Regression coverage includes initial decoded data without seeking, early `seeked`, omitted events, decoding beyond the former deadline, bounded stalls, decode errors, failed seeks, incident sampling coverage and one restart preserving earlier frames.

The ordinary foreground harness also passed with the previous reader. That does not reproduce the exact timing of the owner's original three-second failure; the controlled tests establish the event/deadline weaknesses independently.

Managed-report acceptance in the signed-in extension is pending. A successful capture alone does not establish report accuracy or legal/insurance fault. This public clip is used for private validation, with its source's jurisdictional rights caveat retained in the separate test provenance. No footage is packaged in the extension.

## Release status

Chrome and Firefox 0.8.2 packages are prepared. Neither store submission nor publication is complete; `extension/release-tracker.json` records each separately. The prior 0.8.1 release record is preserved.
