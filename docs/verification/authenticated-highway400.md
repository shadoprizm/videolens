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

The subsequent reruns below evaluated these repairs. A completed pipeline alone was not accepted as report quality.

## Acoustic timestamp alignment repair

The first completed customer's final sound window ended at 16.4986875s, despite the original audio decoding to 17.5786875s. Reproduction on the exact original AV1/Opus file showed that input-side `-ss 0` decoded 263,979 samples; decoding without that input seek produced 281,259 samples at 16 kHz. The 17,280-sample difference is 1.08 seconds, affecting alignment as well as tail coverage. Video-frame hashes at 0s and 10.551s match independent output-side seek references; the observed seek loss was in the sound extraction.

Decode audio once from its presentation origin, bounded to the first 20 minutes, then split the PCM by exact sample positions into at most 60-second API chunks. Preserve the time origin and timestamp gaps with resampling; remove the decoded temporary WAV on both success and failure. Invalidate previous sound/synthesis caches. The original now retains all 281,259 samples, spanning 0–17.5786875s. The shared sound API and both extension archives remain unchanged by this hosted extraction repair.

72 Python tests pass, including the real Opus leading-tone/duration regression, chunk-offset checks, processor consent and failure cleanup. Final production acceptance below includes this alignment repair.


## Empty speech is not a silent recording

The sound-aligned run completed with 40 visual frames, nine sound windows through 17.5787s and 17 reports remaining, but the generated summary incorrectly opened “This is a silent dashcam recording” before describing rumble and clicks. The report was not accepted on pipeline success alone.

The shared managed-review instruction now explicitly distinguishes empty speech from silence. A narrow deterministic guard removes an introductory source-wide “silent recording/video/footage” label when the supplied timeline contains actual heard observations. It does not invent speech, change timestamps, alter cited evidence, remove quotations or reinterpret a silent-film subject. Corrections are logged as a fixed rule identifier without report content and require no additional model call. This English introductory-label guard is not a universal semantic fact checker.

240 website/API tests pass, including the actual contradicted-label case, protected secondary-subject/quotation cases, no-word wording, image-bearing input and malformed-response handling. The existing 72 Python checks remain unchanged. Both existing extension targets receive the managed API correction without new packages or processors. The final acceptance below completes that step.


## Accepted authenticated customer report

The hosted Pro-account flow completed report `3307af87-8084-466b-bd3a-d36933449a84` at 2026-10-30T02:32:46.606Z (October 29 Toronto), using functional production commit `d774c851c135ada58d2b51f116ca012ac03542d0`. Default Detailed report: Luna high visual extraction/review, gpt-transcribe speech, separately opted-in MiMo V2.6 Flash sounds. GLM checkbox off. This exercises the actual Pro entitlement and managed APIs, not a new payment checkout or native extension.

- 40 visual observations, nine acoustic windows, 49 timeline segments. Hosted sound coverage reaches 17.585s (local macOS decode 17.5786875s); ranges are not exact event onsets.
- 17 report processing operations plus one successful follow-up; production SQL verifies 18 total and zero failures. Logical operations are not physical provider-call counts or quality scores.
- Transcript tab correctly says no recognized words does not mean a silent recording.
- Accepted content attributes 401 / Black Creek Drive to the sign, treats speed as an unverified overlay, preserves uncertain vehicle activity near the truck/snow spray, and separates rumble/click/rustling from unknown sound sources. It does not establish contact, fault or the cause of slowing.
- Actual customer follow-up asks what audio adds and what cannot be concluded. It cites rumble at 2–6s, noise/click at 10–12s and rustling at 12–14s, explaining why these do not independently confirm braking, impact or collision.
- 15 of 20 reports remained after four successful QA/acceptance runs and the pre-existing report. The initial failed attempt restored its allowance. Successful QA runs were not silently refunded or relabelled. This report was not cloud-saved; the older saved report was not overwritten.

## Live comparison and selected reviewer

GLM still asserted current Highway 401 location after full image coverage and stronger evidence instructions. Luna high passed the same public source through the ordinary customer flow. Managed general review/follow-up now uses Luna even for existing opted-in clients. MiMo remains the actual-sound model. The hosted UI removes the inactive GLM checkbox; existing extension consent permits a broader processor set than the selected route. No new processor or extension archive is introduced.

[Official Luna pricing](https://developers.openai.com/api/docs/pricing) checked for this decision lists standard input/output at $0.10/$0.50 per million tokens (cached input $0.01). The checked Gateway catalogue listed GLM Flash at $0.15/$0.50. Image tokenization, reasoning, caching and retries affect actual totals. This does not establish the accepted run's exact total cost or a universal best model. Prior measured GLM costs remain historical evaluation results.

## Actual customer exports

[Read the report](https://videolens.io/highway400-customer-report.html), [PDF](https://videolens.io/highway400-customer-report.pdf), [Markdown](https://videolens.io/highway400-customer-report.md), [JSON](https://videolens.io/highway400-customer-report.json).

JSON is unedited `analysis.json` captured from the completed production UI cache. Its production preview HTML matched the then-current exporter byte-for-byte (SHA-256 `92ecac75899d8248f51f53af6ca3ae6c5905703c24b6ef3da94fb7e3990af958`). Export QA found duplicated exact source limitations and isolated PDF heading/footer pages. Product exporters now deduplicate identical limitations; print tables flow across pages, branding/page numbers use the print margin, and the method note includes available sound observations. Published HTML/Markdown/PDF use this repaired exporter on the exact JSON. Findings, timestamps and confidence were not manually rewritten. Original preview capture remains local evidence.

PDF: 15 pages, populated timeline opening/final notes pages, repeated table headers and numbered footers. First/timeline/final pages visually checked; every page's text inspected. No branding-only extra page. Artifacts use public-source evidence only, without account email, credentials or private paths. They have `X-Robots-Tag: noindex, nofollow` and no sitemap/navigation links.

Checks: 240 website/API and 73 Python tests; actual completed authenticated report, follow-up and Transcript tab. Native download dialogs remain unverified while Mac is locked; PDF/Markdown are generated by the product exporter from actual captured JSON. Successful rerun used the original public URL, not a second native file upload. Native extension acceptance and universal event-detection accuracy are not claimed. Both existing browser targets receive the shared API route repair; extension source/archives are unchanged.


## Final deployment verification

[PR #48](https://github.com/shadoprizm/videolens/pull/48) merged as `cad9d04980166385e3f8eb0057350ec188efff64`. Both main CI workflows passed. Vercel `dpl_36zdVagST9U2ppfCPTRJmCs31rKa` is READY for that exact source on videolens.io/www. Railway deployment `7429454582` for the same source succeeded at 2026-10-30T02:50:06Z; hosted health returns `ok`. All four HTTPS report files return 200, match local bytes, and carry the noindex/nofollow header. Public HTML visually inspected in the in-app browser. A hosted evidence jump to 10.11s seeks the player to its supported whole-second start (10s); frame-accurate playback is not claimed.

Published artifact SHA-256 values:
- JSON: `059e72a7c6eb4380749fe611de72fca57f361587a1de27cdcb2556cecd9f3476`
- HTML: `b2deee5ad28d84504f1f35999ec9539dfd831105489f57aea48fc80e429299ee`
- PDF: `3a121ca2d52efd61a72ee861bf8972cedbc977694db39fabc4551899dab8d043`
- Markdown: `6381b7b0833654011988834608eade0fe4530fe5ccff1ad6addda73a6d3f5cee`
