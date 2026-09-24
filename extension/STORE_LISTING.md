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
Turn videos into clear, timestamped reports—right in Chrome’s side panel.

VideoLens helps you understand what matters and return to the moments behind each finding. It analyzes sampled frames, on-screen text, and available captions, then organizes the results into a report with timestamped evidence.

Open a YouTube video or Short, a compatible HTML5 player, or a supported local video file. Choose a report type and tell VideoLens what you want to learn.

CHOOSE A REPORT FOR YOUR TASK
• Detailed report: main ideas, context, examples, caveats, and conclusions
• Key insights: the most useful takeaways
• Tutorial guide: ordered steps, commands, warnings, and checks
• Interview or podcast: themes, claims, quotes, and follow-up questions
• Meeting: decisions, commitments, and next steps
• Bug report: reproduction steps, failure modes, and severity
• UX review: friction in session replays and screen recordings
• Product demo: features and positioning
• Content review: hooks, pacing, claims, and calls to action
• Privacy scan: possible secrets and personal information visible in a video
• Recipe Preview: ingredients, quantities, and steps, with estimates and missing details clearly marked

FOLLOW UP AND CHECK THE EVIDENCE
Ask follow-up questions about an analyzed video without starting over. Use timestamp references to revisit the source and check the context behind a finding. Open the complete report in a full-page reader.

KEEP YOUR REPORTS
Reports and follow-up answers save automatically to a local library on your device. Continue your latest report, search your library, reopen earlier reports, or delete them. VideoLens does not limit the number of reports you can save locally; available device storage applies. Export a library backup and restore it later.

Cloud storage is optional and off by default. Connect a VideoLens account to upload reports you choose or save future reports online. Local copies remain available, and library uploads do not use managed report credits.

EXPORT AND READ OFFLINE
Download a self-contained HTML report, print a polished PDF through Chrome, export Markdown or JSON, or copy the report as text. Open saved reports offline.

CHOOSE YOUR REPORT LANGUAGE
Generate reports in English, Simplified Chinese, Traditional Chinese, Latin American Spanish, Brazilian Portuguese, Japanese, Korean, French, German, Romanian, or Hindi. Choose a language yourself, follow your browser language, or match the video. Follow-up answers and exports use your selected language.

CHOOSE HOW AI CONNECTS

PRIVATE / YOUR OWN OPENAI API KEY
Use VideoLens without a VideoLens account or subscription, with no VideoLens analysis-count limit. Video preparation happens in your browser, and selected analysis content goes directly to OpenAI using your key. VideoLens does not receive that content. Your key stays on your device and is sent only to OpenAI. OpenAI bills usage to your account; costs vary by video and processing.

MANAGED / VIDEOLENS PRO
A free VideoLens account includes one managed starter report, with no API key required. Pro includes 20 managed reports per calendar month for US$12/month or US$99/year.

Managed analysis sends the content needed for a report through VideoLens to its AI provider, currently OpenAI. VideoLens does not retain raw frames or audio. Cloud report storage is optional and off by default.

OPTIONAL ONLINE RECIPE LOOKUP
When enabled, recipe lookup sends recipe context through your selected AI connection to OpenAI web search. Search providers may receive queries, and additional provider charges may apply when you use your own API key.

SUPPORTED SOURCES AND LIMITS
VideoLens supports YouTube videos and Shorts, compatible HTML5 players, and local MP4, WebM, and MOV files. Playback depends on Chrome’s supported codecs.

For videos playing in a webpage, VideoLens uses captions available to it. Supported local files up to 20 minutes can be transcribed; longer local files are analyzed visually without audio transcription.

DRM-protected videos and live streams are not supported. Some websites restrict frame capture. Recipe Preview includes estimates and has not been kitchen-tested; check missing details before cooking.

OPEN SOURCE AND PRIVACY
VideoLens is open source under the MIT license.
Privacy policy: https://videolens.io/privacy
Source code: https://github.com/shadoprizm/videolens
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

## Version 0.7.2 — September 24, 2026

Faster startup: the side panel shows its start screen sooner; saved reports and account recovery no longer block it.
