# Chrome Web Store listing — copy & assets

Everything to paste into the Chrome Web Store developer console.

## Basics

- **Name:** VideoLens — YouTube Video Summaries
- **Category:** Productivity → Tools
- **Language:** English

## Summary (132 chars max)

> Turn YouTube videos and local files into polished, timestamped reports. Private BYOK mode plus optional managed Pro.

## Description

```
VideoLens turns videos into useful written reports — right in Chrome’s side panel.

Understand the important ideas, capture visual details, and return to the moments that matter. VideoLens combines sampled frames, on-screen text, and available captions or audio to create structured reports with timestamped evidence.

Open a YouTube video or supported HTML5 player, choose a report style, and tell VideoLens what you want to learn. YouTube Shorts and local video files work too.

CHOOSE THE REPORT YOU NEED

- Detailed report — main ideas, context, examples, caveats, and conclusions
- Key insights — the most useful takeaways
- Tutorial guide — ordered steps, commands, warnings, and verification
- Interview / podcast — themes, claims, quotes, and follow-up questions
- Meeting — decisions, commitments, and follow-up actions
- Bug report — reproduction steps, failure modes, and severity
- UX review — friction in session replays and screen recordings
- Product demo — features and positioning
- Content review — hook, pacing, claims, and calls to action
- Privacy scan — possible secrets, credentials, and personal information visible in a video
- Recipe (preview) — ingredients, quantities, and preparation steps from cooking videos, with estimates and missing details clearly marked

ASK QUESTIONS AND EXPLORE THE EVIDENCE

Ask follow-up questions about an analyzed video without starting over. Use timestamp citations to return to the source and check the context behind a finding.

Open the complete report in a spacious full-page reader directly from the side panel.

KEEP YOUR REPORTS

Completed reports and follow-up answers save automatically to a local library on your device. Continue your latest report, reopen earlier reports, search their contents, or delete them.

There is no VideoLens-imposed limit on locally saved reports; available device storage still applies. Export a library backup and restore it when needed.

Cloud storage is optional. Connect a VideoLens account and choose to upload existing reports or save future reports and answers online. Local copies remain available, and library uploads do not use managed AI report credits.

EXPORT SOMETHING WORTH SHARING

- Download a self-contained HTML report
- Save a polished PDF through Chrome’s print dialog
- Export Markdown or JSON
- Copy the report as text
- Read locally saved reports offline

CHOOSE YOUR REPORT LANGUAGE

Generate reports in English, Simplified Chinese, Traditional Chinese, Latin American Spanish, Brazilian Portuguese, Japanese, Korean, French, German, Romanian, or Hindi.

Choose a language independently of the video, follow your browser language, or select Same as video. Follow-up answers and exports use the selected report language.

TWO WAYS TO USE VIDEOLENS

Private / BYOK

Use your own OpenAI API key with no VideoLens subscription or analysis-count limit. Video preparation happens in your browser, and selected analysis content goes directly to OpenAI. Your key is stored locally and sent only to OpenAI.

OpenAI usage is billed to your OpenAI account. Costs vary with the video and processing required.

Pro / Managed

Analyze without setting up an API key. A free account includes one managed starter report. Pro includes 20 managed reports per calendar month for $12/month or $99/year.

Managed analysis sends the required content through VideoLens to the configured AI provider, currently OpenAI. VideoLens does not retain raw frames or audio. Cloud saving is optional and off by default.

Optional online recipe lookup sends recipe context through your selected AI connection to OpenAI’s web search. Search queries may reach search providers, and lookup adds provider charges when using your own API key.

SUPPORTED SOURCES AND LIMITS

VideoLens supports YouTube videos and Shorts, compatible HTML5 video players, and local video files. MP4, WebM, and MOV playback depends on the codecs supported by Chrome.

For in-page videos, spoken content comes from available captions; VideoLens does not directly transcribe tab audio. Supported local files up to 20 minutes can be transcribed. Longer local files use visual analysis without audio transcription.

DRM-protected video and live streams are not supported. Some websites prevent frame capture through browser security restrictions.

Recipe preview supports YouTube and local files. Reconstructed recipes have not been kitchen-tested; review estimates and missing details before cooking.

OPEN SOURCE

VideoLens is open source under the MIT license. Private mode remains free to use, with AI usage billed separately by OpenAI. Pro provides optional managed processing and account features.

Source code: github.com/shadoprizm/videolens
Privacy policy: videolens.io/privacy

RELEASE NOTES — VERSION 0.7.1 · SEPTEMBER 18, 2026

- Added Create a Lesson, with learning objectives, guided modules, checkpoint questions, saved study progress, a final challenge, and printable student worksheets and answer keys
- Upgraded Tutorial Guide to Make a Procedure, producing source-backed prerequisites, exact actions and settings, success checks, clearly marked gaps, and a reusable checklist
- Added account-first onboarding: create a free account and make one managed starter report without an API key or credit card
- Kept Private / BYOK mode free and available without creating a VideoLens account
- Improved report continuity so managed reports save locally, survive sidebar or checkout restarts, and refresh account access after checkout
- Improved failure guidance, duplicate-analysis protection, and Recipe draft preservation while optional online research continues
```

## Permission justifications (the review form asks for each)

| Permission | Justification |
|---|---|
| `sidePanel` | The entire product UI lives in the side panel so the report can sit next to the video being analyzed. |
| `storage` | Stores the user's OpenAI API key, settings, privacy choice, selected report language, selected analysis mode, and (only after the user connects Pro) a limited VideoLens account token locally on the device. Completed reports and Q&A are stored separately in local IndexedDB. Nothing uses Chrome sync. |
| `activeTab` | Grants temporary access to a non-YouTube tab when the user opens VideoLens from Chrome's Extensions menu, so the extension can find the video element on the page the user chose. |
| `scripting` | Injects the frame-capture routine (canvas sampling of the page's `<video>` element) and caption reader into the active tab, only after the user invokes the extension there. |
| Host `api.openai.com` | All AI processing (transcription, frame description, analysis) is performed with the user's own OpenAI API key, called directly from the browser. |
| Optional host `youtube.com` | Requested when the user first analyzes a YouTube page. It lets VideoLens find the selected video's player, sample frames, and read available captions even when the panel was opened from Chrome's side-panel picker. It does not run until the user starts an analysis. |
| Optional host `videolens.io` | Requested only when the user chooses to connect a VideoLens account. It lets the extension authenticate the managed-report allowance, call the managed AI proxy, and optionally save the completed report. Free Private mode never requests or needs this host access. |

**Single purpose description:** AI analysis of videos (on-page or local files) into timestamped written reports, using either the user's own OpenAI API key or an optional VideoLens managed allowance.

**Remote code:** None. All executable code ships in the package. The extension calls data APIs at OpenAI and, only after the user enables Pro, videolens.io.

**Data usage disclosures (Privacy tab):**
- Check **Personally identifiable information**: an email address is used only when the user explicitly creates/connects a VideoLens account for managed mode, subscription access, and the optional cloud library.
- Check **Authentication information**: Private mode stores the user's OpenAI API key locally and sends it only to OpenAI. Managed mode stores a limited VideoLens account token locally; website login and payment credentials are not copied into the extension.
- Check **Website content**: the selected video's frames, audio or captions, page title, analysis prompt, and follow-up questions go directly to OpenAI in Private mode or through VideoLens and Vercel AI Gateway to the configured AI provider (currently OpenAI) in Managed mode.
- Check **User-provided content** if offered: prompts, follow-up questions, local video content, and an optionally cloud-saved completed report are user-provided/requested content.
- Completed reports, timelines, and follow-up Q&A are also saved automatically in local IndexedDB so the user can reopen them. This local library stays on the device, is not synced, and is removed when the extension is uninstalled.
- Check **Web history** if the dashboard defines it to include the active page URL: VideoLens reads the URL and title only for the page the user explicitly invokes. The source URL can be included in an exported report and in the cloud report only when the user enables cloud saving.
- Do not check health, financial information, communications, location, or general user activity unless the dashboard's definitions require a category because that information happens to appear inside a user-selected video. Nothing is sold, used for unrelated purposes, advertising, or creditworthiness.
- The first-run disclosure obtains affirmative consent before any analysis-related data handling occurs.
- Privacy policy URL: `https://videolens.io/privacy`

## Assets checklist

- [x] Icon 128×128 — `public/icons/icon128.png`
- [x] Five screenshots, 1280×800 — `store-assets/screenshot-*.png`
- [x] Two localized Simplified Chinese screenshots, 1280×800 — `store-assets/zh-cn-screenshot-*.jpg`
- [x] Small promo tile 440×280 (required)
- [x] Marquee 1400×560 (optional) — `store-assets/marquee-1400x560.png`

## Version 0.4.5 — September 13, 2026

Upload your existing report library to your VideoLens account, including reports created with your own API key and follow-up answers. See upload progress, retry failed uploads without duplicates, and keep your local copies. Optionally save new reports and answers to the cloud. Uploads do not use managed AI report credits.
