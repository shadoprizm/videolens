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
VideoLens analyzes the video you're already watching and returns a structured,
timestamped report — right in Chrome's side panel.

WHAT'S NEW — SEPTEMBER 13, 2026 · VERSION 0.4.5
• Upload your existing library to your VideoLens account, including BYOK reports and follow-up answers
• Save new reports and follow-up answers to the cloud when you choose
• See upload progress and retry failed uploads without duplicates
• Keep local copies; uploads use no managed AI report credits

Choose the report language independently from the video. VideoLens supports
English, Simplified Chinese, Traditional Chinese, Latin American Spanish,
Brazilian Portuguese, Japanese, Korean, French, German, Romanian, and Hindi,
plus an automatic same-as-video option.
Follow-up answers and exported reports stay in the selected language.

Every completed report and its follow-up Q&A are saved automatically to a
private local library in Chrome. Continue the latest report, reopen any saved
report, or delete it whenever you want. The local library has no VideoLens-
imposed report-count limit and is never synced or sent to VideoLens.

Open a YouTube video or another page with an HTML5 video player, choose a
report style, and ask what you want to learn. VideoLens samples frames, reads
available captions, and creates an evidence-grounded analysis where every
finding cites the exact moment in the video. Local video files work too
(mp4 / webm / mov), including audio transcription for files up to 20 minutes.

REPORT STYLES AND SPECIALIZED MODES
• Detailed report — important ideas, context, examples, caveats, and conclusions
• Key insights — signal without repetition or filler
• Tutorial guide — ordered steps, commands, warnings, and verification
• Interview / podcast — themes, claims, quotes, and follow-up questions
• Bug report — repro steps, failure modes, severity
• Meeting — decisions, commitments, follow-up actions
• UX review — user friction in session replays and screen recordings
• Product demo — feature inventory and positioning analysis
• Content review — hook, pacing, claims, call-to-action critique
• Privacy scan — find secrets, credentials, and PII before you share

TWO CLEAR MODES
Private / BYOK mode is free forever. The pipeline runs inside your browser;
the selected video's frames, audio or captions, page title, and your prompt
go directly to OpenAI using your key. VideoLens does not receive them. Your
key stays on your device. A typical video costs $0.05–$1.50 in OpenAI usage,
billed directly to your OpenAI account. An estimate appears before each run.

Pro / Managed mode removes the API-key setup. The analysis content passes
securely through VideoLens and Vercel AI Gateway to the configured AI provider
(currently OpenAI) and counts against a managed-report allowance. A free account
includes one managed starter report. Pro includes 20 managed reports per calendar
month for $12/month or $99/year. Raw frames and audio are not retained. Saving
the completed report to your cloud library is optional and off by default.

OPEN SOURCE
The private BYOK workflow remains free under the MIT license with unlimited
analyses. Pro is an optional convenience layer, not a replacement for Free.

ALSO IN THE BOX
• Follow-up Q&A: ask more questions against the analyzed timeline for cents
• Unlimited local report library with Continue, reopen, and delete controls
• Multilingual reports with automatic browser-language and same-as-video options
• Download a self-contained, professionally designed HTML report
• Open the print-ready report and save a polished PDF using Chrome's print dialog
• Export Markdown or JSON, or copy the report as text
• Open source (MIT): github.com/shadoprizm/videolens

LIMITS WORTH KNOWING
DRM-protected players (Netflix, Disney+, etc.) cannot be captured — this is
a browser security guarantee, not a bug. Live streams are not supported.
Audio transcription of in-page videos uses available captions (YouTube);
local files up to 20 minutes are transcribed directly. On other sites,
cross-origin video security can prevent frame capture.
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
