# Highway 400 authenticated customer acceptance

## First production run — October 29, 2026

Used the real production hosted app, the existing Pro account, the original 17.585-second Highway 400 WebM upload and the default Detailed report preset. Explicitly enabled optimized general-report routing and actual-sound processing through the customer controls. Started with 19 of 20 reports remaining.

Speech transcription succeeded with no recognized words. Two Luna visual operations succeeded. The sound operation failed after 65,438 ms with `request_timeout`; the overall report failed and its allowance was restored. No completed report or cloud save was claimed for this attempt.

The customer-visible log also exposed two quality defects: only four frames were sampled at a five-second interval, and the progress indicator marked “Speech & sounds” complete before independent sound processing actually began.

## Repairs

- Permit 40-second acoustic-observation calls and a 90-second consistency review, within a 240-second operation deadline, the 290-second client timeout and 300-second server budget. Cancel other workers immediately when one fails; retain failure semantics instead of delivering partial audio as complete. Add content-free timing/stage diagnostics.
- Sample short videos across their full duration using the frame budget, capped at four samples/second for tiny clips. The hosted default is 40 frames. Known-duration frames use explicit accurate seeks rather than assigning fps-filter output times to potentially later source frames. Bump the processing cache version. Longer videos preserve their requested spacing and frame cap.
- Give Sounds its own progress stage between Timeline and Analyze.

[FFmpeg documents accurate seeking when transcoding](https://www.ffmpeg.org/ffmpeg-all.html). Cited frame timestamps remain sample times, not independently measured event onsets.

## Local verification

- 233 website/API tests pass, including a delayed acoustic-response regression and cancellation of remaining workers after a failure.
- 68 Python tests pass, including a real 400 ms visual event that fell between the previous five-second samples, correct colors at cited sample times, bounded long-video sampling and separate sound-stage progress.
- The original Highway 400 file yields 40 frames from 0 to 17.145 seconds in approximately 7.5 seconds on the owner Mac.
- Extension impact: the timing repair is in the shared managed API and benefits both existing 0.8.4 browser clients. Hosted sampling/progress changes do not modify extension code, permissions, consent, processors or submitted archives. No replacement browser package is needed for these repairs.

## Production rerun

Pending deployment and a fresh authenticated run. A successful local model test is not customer-flow acceptance.
