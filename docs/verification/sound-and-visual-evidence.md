# Sound and visual evidence — October 29, 2026

VideoLens previously transcribed speech but did not analyze environmental sounds. A “complete” dashcam report could therefore omit what was heard. The new Managed path independently analyzes actual audio, then gives the reviewer separate sound, speech and visual evidence.

## Selected route and measured price

- **Visual observations:** GPT-6 Luna, high reasoning; original timestamped images are supplied again during general-report review.
- **Speech:** gpt-transcribe. A successful empty result means no recognized words.
- **Sound observations:** Xiaomi MiMo V2.6 Flash, pinned to DeepInfra through Vercel AI Gateway. Catalogue rate checked: US$0.14/M input and $0.28/M output tokens.
- **General report review:** GLM 5.3 Flash, high reasoning, pinned to Baseten; the existing OpenAI recovery route remains available.

MiMo is the best value candidate among the accessible routes tested here, **not a demonstrated universal winner**. In a matched single-pass comparison on six five-second ESC-10 environmental clips, MiMo cost $0.000312413 total versus Gemini 3.8 Flash's $0.00508725 (16.3 times as much). This compares measured cost, not a formal accuracy score. MiMo identified a bark and regular clicks and described other recordings conservatively as noise/rumble/rushing. Neither model reliably established all physical source identities.

The original 17.585-second Highway 400 video contains 17.5787 seconds of decoded audio. Guarded sound runs cost about **$0.0013–$0.0018** and took about 22–38 seconds for nine windows. The final example's fresh GLM review cost **$0.0080104**, taking 54.4 seconds; it reused the earlier 40-frame extraction. The earlier extraction cost $0.01073286. Adding these components gives roughly two US cents before speech and infrastructure. Speech at the checked $0.0045/min catalogue rate adds an estimated $0.00132 for this clip; actual total depends on caching, retries, reasoning and input size.

[Read the combined report](highway400-sound-and-visual-report.md). [Machine-readable evaluation evidence](sound-model-evaluation.json).

## What failed in candidate evaluation

- Unprotected Gemini 3.5 Flash Lite and Gemini 3.8 Flash invented events in digitally silent input and placed a known synthetic tone at wrong times.
- MiMo Flash handled the silent control better, but its freely generated event timestamps were also wrong. MiMo Pro was costlier and invented sounds in silence.
- Qwen 3.8 Omni Flash returned HTTP 400 through the available Gateway audio transports, including raw-base64 and data-URI tests. This is a route limitation, not evidence that the native Qwen model is inferior.
- Muse Spark Open returned an answer explaining it had no accessible audio. HTTP 200 alone did not establish successful audio analysis.
- Available OpenAI/Google realtime token minting returned HTTP 403. Those models were not successfully benchmarked.
- The checked Gateway catalogue did not expose audio-input routes for the considered Claude, GLM, Kimi, MiniMax or DeepSeek text models. Their text reasoning cannot replace hearing actual audio.

## Safeguards in the implementation

1. Validate actual mono PCM16 WAV bytes and duration, bounded to 60 seconds per operation. A separate, atomic database quota caps sound at 20 operations per report; chat and speech retain their existing budgets. Every worker is bound to the owner's report reservation.
2. Split into two-second windows, with offsets computed from sample positions. Trim only exact digital zeros. Do not send digital silence to an audio model. Quiet nonzero sounds remain eligible even below the speech transcriber's silence threshold.
3. Analyze each window independently using two audio encodings. A consistency review keeps only shared acoustic qualities. A deterministic veto prevents the reviewer from introducing consequential tone/horn/impact/click labels absent from either observation, or speculative object identities. Disagreement becomes explicit uncertainty. This reduces errors; it does not prove descriptions correct.
4. Use schema-validated responses, named-provider routing, bounded concurrency/timeouts/retries, and no silent provider fallback for sound. A failed window fails the sound operation, allowing the existing failed-report allowance recovery path to operate.
5. Keep sounds separate from transcript and visual descriptions in the evidence timeline, final review, follow-up Q&A, local/cloud storage and HTML/Markdown exports. Require the reviewer to address both modalities and explain whether the audio corroborates the visual event.
6. Require a new versioned extension notice or a separate hosted-app checkbox naming DeepInfra/MiMo. Older consent does not authorize the new processor. DeepInfra's [inference privacy documentation](https://docs.deepinfra.com/account/data-privacy) says ordinary inference content stays in memory and is not used for training; the Gateway catalogue does **not** mark this route as ZDR, and the disclosure does not promise otherwise.
7. Admin counts are labelled processing requests, with a separate Sounds role. These are logical processing operations, not physical provider-call counts or quality scores. A sound operation may contain many audio windows and consistency checks.

## Empty speech was being misreported as a network failure

The current route reproduced `AI_NoTranscriptGeneratedError` on the Highway 400 clip. Inspection of the installed AI SDK and Gateway adapter showed the Gateway response validates a required text string, then the higher-level SDK throws when that string is empty. VideoLens's generic exception classifier treated it as a network error and retried it.

The fix recognizes the SDK's specific empty-transcript exception as successful `{text: ""}`. Actual authentication, transport and malformed-response failures keep their error handling. A real retest returned HTTP 200 with no error in 1.5 seconds, without a redundant retry. This reproduces the current bug; the historical mini-transcribe diagnostic is too coarse to prove it had the identical cause.

## Verification and practical limits

- Website/API: 231 tests pass, including silence, fixed tone bounds, malformed/oversized/stereo WAV, fresh consent, provider routing, failure recording, unsupported sound vetoes, and empty-transcript handling.
- Extension: 115 tests pass; both Chrome and Firefox build/package and Firefox lint reports zero errors/warnings/notices. A quiet-sound test verifies that speech silence filtering cannot discard sound analysis, later chunks retain global offsets, and file decoding is reused.
- Python: 65 tests pass, including new processor consent, chunk offsets, timeout handling and temporary-audio cleanup.
- Production SQL rollback fixture passes: 20-operation sound cap, independent chat/speech budgets, cross-account isolation and service-only RPC access. Synthetic data is rolled back.
- Synthetic silence and a known tone are handled correctly by the guarded pipeline. Broadband-noise controls produce noise descriptions. Sparse synthetic clicks sometimes remain uncertain; the system does not claim reliable fine transient detection.
- Six labelled ESC-10 recordings provide an additional small sanity check, not a benchmark accuracy claim. Attribution and filenames are in the evaluation JSON; [ESC-10 licensing and source details](https://github.com/karolpiczak/ESC-50#license).
- Local Managed uploads up to 20 minutes and opted-in hosted uploads/URLs include sound observations. Hosted sound coverage is the first 20 minutes. Browser-tab reports currently have captions, not raw sound analysis, and explicitly disclose that limitation. Private OpenAI-key mode does not silently send audio to another provider.
- Audio is downmixed to mono; direction and spatial source location are not measured. Quiet, short, masked and overlapping sounds can be missed. Shared model errors remain possible. No legal fault, impact or absence of contact should be inferred from generic sound descriptions.

Reproduce a bounded audio test with existing Gateway authentication:

```sh
vercel env run -e production -- node /path/to/videolens/scripts/evaluate-sounds.mjs /path/to/public-test.wav
```

The script uses the production helper and prints observations, elapsed time and measured Gateway cost. It never prints credentials or raw audio.
