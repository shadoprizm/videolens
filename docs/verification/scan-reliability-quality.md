# Scan reliability and model economics — 2026-10-29

## Failures and recovery

The production audit found three stranded managed reservations: two with no AI requests and one with 14 successful AI operations but no completion notification. They consumed allowance despite having no recorded completed report. Historical zero-request failures did not retain a precise client cause; the original dashcam transcription retained a generic transport/SDK category, not an upstream root cause. Do not label those historical causes as proven.

The service-only `release_stale_managed_reports` function preserves audit history, closes managed reservations idle for over one hour as interrupted, and restores allowance. It checks report updates and the latest AI operation's estimated finish time, skips locked rows, and excludes complete reports and library uploads. Recovery runs when allowance/reservations are checked and through an authenticated hourly maintenance endpoint. The three historical reservations were released in production; there were zero pending reservations afterward. Synthetic active/recent/foreign/library/completed fixtures and service-only privileges passed in a rollback transaction.

Client completion notifications retry idempotently. Hosted Streamlit interruptions, including its non-Exception rerun path, attempt to close the reservation. The hosted app no longer promises that allowance was restored when synchronization failed. Reservations can include title/source/mode before AI work. The existing local-file decoder recovery from PR #37 is included without changing the original dirty checkout.

The default speech model migrates to gpt-transcribe; published mini-transcribe requests are mapped server-side. OpenAI schedules the deprecated transcription family's shutdown for 2027-02-26. Synthetic speech succeeded through both old and new Gateway routes during investigation, so this does not reproduce or prove the original failure's cause. Bounded retries now cover transport failures and timeouts. SDK configuration/response-validation exceptions no longer all appear as network errors.

## Evidence quality

The former visual stage described isolated frames without the user's focus. The native 40-frame dashcam report missed the brief right-side vehicle movement and made an overly broad negative finding. General reports now compare overlapping sequences with that focus, retain observations by supplied timestamps, and let the final writer inspect bounded original images as well as the timeline. Size-limited direct review is disclosed. Too little analyzed visual evidence fails the report rather than silently charging for an inadequate result. Source limitations remain in exports, and invalid citations are removed with lowered confidence.

## Model evaluation

Public source: [400 SB Crash](https://commons.wikimedia.org/wiki/File:400_SB_Crash.webm), 17.585-second AV1/Opus footage. Images and original source footage are kept outside the repository. These are private validation runs, not a redistribution of the source clip. Analysis does not establish a collision, cause, identity, intent or legal/insurance fault.

The Gateway live catalogue and endpoints were checked, including vision support, reasoning options, pricing tiers and serving providers. Selection uses actual generation charges, not input/output headline prices alone. Experiments use only the public source and synthetic fixtures; no other member's media was sent to candidate providers.

First-round identical event-window requests (USD, excluding speech):

| Model | Charge | Seconds | Observed limitation |
|---|---:|---:|---|
| Qwen 3.7 Flash | 0.000465 | 15.8 | Cheapest; full-report test later overstated unverified overlay speed/date in its summary |
| GLM 5.3 Flash | 0.002139 | 12.5 | Described orientation changes and retained uncertainty |
| MiniMax M3.1 Flash | 0.002249 | 19.1 | Useful detail; later report conflated unavailable audio with visual brake-light evidence |
| GPT-6 Luna high | 0.002598 | 23.0 | Under-described the event as final writer in this case |
| Claude Haiku 5.5 | 0.003464 | 23.2 | More generic about the orientation change |
| Qwen 3.7 Plus | 0.005584 | 29.6 | More costly without a demonstrated advantage here |
| MiniMax M2.7 (text only) | 0.007117 | 73.9 | Fenced JSON rather than the required strict object |
| Kimi K2.5 | 0.008726 | 18.3 | Fenced JSON rather than the required strict object |
| DeepSeek V4.1 Flash (vision) | 0.008747 | 25.5 | Exhausted the 6,000-token test output budget; truncated JSON |
| GLM 5.3 (text only) | 0.010064 | 12.9 | No direct-image review; more costly than its multimodal Flash variant |
| DeepSeek V4 Flash (text only) | 0.003287 | 39.7 | No direct-image review and more generic evidence description |

These are single-run observations, not universal model rankings or proof a model always fails. A separate full 40-observation, size-bounded image review used the actual report parser: Qwen Flash cost $0.004828, GLM Flash $0.007697, MiniMax M3.1 Flash $0.005240. The Qwen-to-GLM full-pipeline candidate cost $0.011752 for 40 frames, but was rejected: provisional Qwen captions promoted sliding, stationary vehicles and roadway assignments too confidently. The selected candidate instead uses GPT-6 Luna high for extraction and GLM Flash for review, with GPT-6 Luna as the bounded OpenAI fallback. The measured Luna extraction pass cost $0.017526 for 40 frames; the separate GLM final review cost $0.007697. A fresh full-pipeline run with the selected pairing then analyzed all 40 frames in 15 requests, took 151.5 seconds, and cost $0.018569 (excluding transcription). It identified the right-side movement, snow cloud and angled vehicle while qualifying overlay readings and contact uncertainty. The non-incident first-six-frame control used the Luna timeline and GLM review ($0.002083 for review) and did not invent an incident or misassign separated-roadway traffic. The model checks remain a small public clip/control corpus, not proof of quality across all report topics. GPT-6.1 Sol is excluded from the managed allowlist and production defaults.

GLM routing is restricted to Baseten's advertised zero-retention/no-training endpoint. The updated extension disclosure names Baseten and OpenAI and requires acknowledgement again. The hosted app has an explicit processing checkbox. Without the updated policy marker, requests retain an OpenAI destination. The new processors apply only to the evaluated general-report workflow; other report types and Private/BYOK retain OpenAI models.

## Release verification

Local verification: 221 website/API tests, 62 Python tests, 111 extension tests, both browser packages, and Firefox lint with zero errors, notices or warnings. Selected candidate/control checks passed the stated evidence criteria. CI, production deployment and store submissions remain pending. Do not call the extension release complete until Chrome and Firefox both publish 0.8.3. The release tracker preserves the previous 0.8.2 preparation and earlier release records.

Official sources: [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations), [file transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [Gateway model catalogue](https://ai-gateway.vercel.sh/v1/models), [Gateway routing](https://vercel.com/docs/ai-gateway/models-and-providers/provider-filtering-and-ordering).
