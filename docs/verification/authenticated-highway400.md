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

PR #44 merged as `634b501a674070159c5cb6760285ceed28197159`. Vercel deployment `dpl_3P2BPwqBuJX5ECKLwZtqCmbZ1wC6` is READY on production aliases. Railway GitHub deployment `7428475882` reports success at 2026-10-30T01:38:13Z (October 29 in Toronto).

A fresh Pro-account run using the original public URL completed with 40 described frames and nine independent sound windows (49 total segments), an empty successful transcript and available HTML/PDF/Markdown/JSON controls. The public source matches the local original's 10,203,290-byte size and SHA-1 `64d77f4ecfeb35a1e25933b45a4a1841075acc03`. Mac locking prevented the repeated native upload/download interaction; the new URL run is not claimed as a completed repeat-upload acceptance.

Content review found further defects: the final synthesis silently reduced the 40 original images to ten because of its encoded request budget, it treated a destination sign as proof of the current highway, and the Transcript tab still labelled a successful empty transcript as possible failure. The original extraction captions preserve the dark cars' 9.7–12.7s changes better than the final report did; the report's broad negative finding and later timing needed more careful review. Source JSON also retained resolver-time false frame/OCR flags after extraction.

## Final-review coverage repair

- Resize all review images within the existing 2.5 MB encoded budget instead of repeatedly dropping alternate timestamps. Highway 400 retains all 40 images in 1,641,908 encoded bytes; original full-resolution frame/OCR evidence remains available. Invalidate older synthesis caches.
- Apply a shared managed-review policy to preserve secondary-subject changes, distinguish signs from current-location proof, scope negative findings to the relevant subject and evidence, preserve event timing, and distinguish incomplete audio from uncertain but supplied windows. This API policy applies to both existing browser targets without changing their archives or consent.
- Explain successful no-word transcription correctly in the Transcript tab. Update exported source flags from the actual extracted evidence.
- 234 website/API and 70 Python tests pass, including retention of every timestamp under a forced image budget and the empty-transcript UI regression.

Final authenticated report rerun and export inspection remain pending the review repair deployment. A completed pipeline alone is not accepted report quality.

## Acoustic timestamp alignment repair

The first completed customer's final sound window ended at 16.4986875s, despite the original audio decoding to 17.5786875s. Reproduction on the exact original AV1/Opus file showed that input-side `-ss 0` decoded 263,979 samples; decoding without that input seek produced 281,259 samples at 16 kHz. The 17,280-sample difference is 1.08 seconds, affecting alignment as well as tail coverage. Video-frame hashes at 0s and 10.551s match independent output-side seek references; the observed seek loss was in the sound extraction.

Decode audio once from its presentation origin, bounded to the first 20 minutes, then split the PCM by exact sample positions into at most 60-second API chunks. Preserve the time origin and timestamp gaps with resampling; remove the decoded temporary WAV on both success and failure. Invalidate previous sound/synthesis caches. The original now retains all 281,259 samples, spanning 0–17.5786875s. The shared sound API and both extension archives remain unchanged by this hosted extraction repair.

72 Python tests pass, including the real Opus leading-tone/duration regression, chunk-offset checks, processor consent and failure cleanup. Final production quality acceptance is still pending deployment of this alignment repair and a fresh run.
