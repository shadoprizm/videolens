# Recipe preview — 0.5.0

Recipe reconstructs cooking instructions from YouTube videos (including Shorts) and uploaded video files. Select a source, choose **Change → Recipe (preview)**, and create the report. Optional **Look online for missing recipe details** is off by default. Instagram capture remains outside this preview.

## Behavior

- Samples approximately every half second, capped at 120 frames; longer clips use wider intervals. Four adjacent frames are analyzed together. Unreadable captures and failed groups are disclosed; fewer than half of the captured frames being analyzed stops the report.
- Combines visual observations, readable text, available captions/audio and the current video's creator description. Shorts metadata must match the current video ID.
- Records ingredient identity and amount separately. Instructions, durations and temperatures also have independent evidence. Labels distinguish video evidence, creator text, online references, estimates and unknown values.
- Optional lookup searches after the initial recipe is extracted, with at most three search-tool calls. Actual provider citations are required. Details borrowed from a different recipe must be estimates. Failed lookup preserves the initial draft.
- Works through both Private/OpenAI and managed Pro access. Pro lookup requires an authenticated extension session and an owned report reservation, and counts toward the existing per-report AI request limit.
- Saves the structured recipe with the report. Sidebar, full reader, cloud library, HTML, Markdown and print/PDF retain evidence, missing details and sources. Existing reports remain compatible.

## Evaluation, September 14, 2026

Three real clips ran through the shipping grouped-vision and synthesis modules using the configured gateway. Frames were extracted locally at up to 720 pixels for this evaluation (the extension uses up to 1280 pixels). Audio was withheld; these runs do not measure browser capture or transcription.

| Clip | Frames analyzed | AI calls | AI stage | Provider-reported cost |
| --- | ---: | ---: | ---: | ---: |
| [Three-ingredient cookies](https://www.youtube.com/watch?v=C-NOP35jd3Y), creator description withheld | 119/119 | 31 | 73 s | $0.1773 |
| [Cucumber salad](https://www.youtube.com/watch?v=e-a3F52ToXo), lookup enabled | 108/108 | 30 | 107 s | $0.2291 |
| [Chocolate mousse](https://www.youtube.com/watch?v=7NO6Arsb9JE), creator description included | 48/48 | 13 | 31 s | $0.0629 |

The cookie extraction recovered the visible flour and oil measurements, sugar's displayed glass measure, and baking instructions without inventing the sugar weight stated only in the withheld description. The salad retained the visible ingredient amounts and left unresolved details unknown despite finding comparison recipes. The mousse included water despite the video's “1-ingredient” title, and attributed written quantities to the creator.

Twenty controlled evidence scenarios passed the real synthesis model. They cover absent measurements, servings and cooking times; Celsius/Fahrenheit and volume/weight; contradictory quantities; creator evidence; borrowed recipes; malicious caption/research instructions; non-cooking content; and optional ingredients. These are controlled inputs, not twenty real-video tests or kitchen trials. Results are a small initial sample, not an accuracy guarantee.

## Reproduce

From `extension/`, after `npm ci`, provide `OPENAI_API_KEY` through the environment:

```sh
node scripts/evaluate-recipe.mjs /absolute/video.mp4 /absolute/output /absolute/metadata.json
node scripts/evaluate-recipe-evidence.mjs /absolute/evidence-output
```

The optional metadata JSON accepts `title`, `webpage_url` and `description`. Real-video evaluation requires `ffmpeg` and `ffprobe`. `RECIPE_LOOKUP=1` enables lookup; `RECIPE_WITHHOLD_DESCRIPTION=1` withholds written creator text. For gateway evaluation set `VIDEOLENS_RECIPE_GATEWAY=1` with `AI_GATEWAY_API_KEY` or a valid `VERCEL_OIDC_TOKEN`. Evaluation incurs provider charges and prints aggregate usage, never credentials. Do not commit credentials or downloaded videos.

## Release scope

The same 0.5.0 preview is built and packaged for Chrome and Firefox. This release ships Recipe as an explicitly labeled preview. Broader video evaluation and actual kitchen trials remain before treating reconstructed recipes as reliable cooking instructions. Store submission and publication remain tracked independently for both browsers in `release-tracker.json`.

## Verification and deployment

`npm run release:check` passed: 71 extension tests, both browser packages, and Firefox lint with zero warnings/errors/notices. `site/npm test` passed all 61 tests. The recipe report was visually checked at desktop and narrow widths without horizontal overflow. Recipe facts, copy and rendering share browser-independent modules under `site/shared/`, re-exported through the extension's shared source; Firefox reviewer source includes them.

Supporting website changes are live at https://videolens.io from production main commit `1e1cfa5` (deployment `dpl_GCXwVpzbcLU7xa29EwCbW6mqPsnr`, September 16). The mobile-accessible example is https://videolens.io/recipe-preview. Production pages and the recipe reader bundle return 200; anonymous AI POST/report GET requests return 401. The signed-in production recipe round trip was not run; route authentication/storage tests and earlier real gateway lookup passed separately.

The release merge preserves production's GPT-5.6 Terra frame/synthesis settings and forwards validated reasoning settings through managed AI. Both browser packages passed `release:check` and production GitHub CI; 61 site tests passed.

Firefox 0.5.0 was submitted with reviewer source on September 16 and is awaiting review (AMO version 6491649). Chrome 0.5.0 is built and validated but not submitted: browser-tool access to the publisher dashboard was rejected with “Not allowed,” and no publisher API credentials are configured. The previous unpacked Chrome reload also remained blocked by browser URL policy. Current store submission and publication status is recorded in `release-tracker.json`; this dual-browser release is not yet complete.
