# Chrome Web Store listing — copy & assets

Everything to paste into the Chrome Web Store developer console.

## Basics

- **Name:** VideoLens — YouTube Video Summaries
- **Category:** Productivity → Tools
- **Language:** English

## Summary (132 chars max)

> Turn YouTube videos and local files into polished, timestamped written reports. Uses your own OpenAI key.

## Description

```
VideoLens analyzes the video you're already watching and returns a structured,
timestamped report — right in Chrome's side panel.

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

BRING YOUR OWN KEY — PRIVATE BY DESIGN
The entire pipeline runs inside your browser. The selected video's frames,
audio or captions, page title, and your prompt are sent to exactly one place:
OpenAI's API, using your own API key. No VideoLens servers receive your
analysis data. No VideoLens account, no extension telemetry, no extension
analytics. Your key is stored
only on your device. A typical video costs $0.05–$1.50 in OpenAI usage,
billed straight to your own OpenAI account — estimates are shown before
every run.

OPEN SOURCE
Free under the MIT license — unlimited analyses, no account, no product tier.

ALSO IN THE BOX
• Follow-up Q&A: ask more questions against the analyzed timeline for cents
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
| `storage` | Stores the user's own OpenAI API key and settings locally on the device. Nothing is synced or transmitted to us. |
| `activeTab` | Grants access to the current tab only when the user clicks the VideoLens toolbar icon, so the extension can find the video element on the page the user chose. No persistent host access is requested. |
| `scripting` | Injects the frame-capture routine (canvas sampling of the page's `<video>` element) and caption reader into the active tab, only after the user invokes the extension there. |
| Host `api.openai.com` | All AI processing (transcription, frame description, analysis) is performed with the user's own OpenAI API key, called directly from the browser. |

**Single purpose description:** AI analysis of videos (on-page or local files) into timestamped reports, using the user's own OpenAI API key.

**Remote code:** None. All code ships in the package; the extension calls the OpenAI data API only.

**Data usage disclosures (Privacy tab):**
- Check **Authentication information**: the user enters an OpenAI API key, stored locally and sent only to OpenAI.
- Check **Website content**: the selected video's frames, audio or captions, and page title are sent directly to OpenAI at the user's direction.
- Check **User-provided content** if the dashboard offers that category: the analysis prompt and follow-up questions are sent directly to OpenAI at the user's direction.
- Check **Web history** if the dashboard defines it to include the active page URL: VideoLens reads the URL and title only for the page the user explicitly invokes and sends that context directly to OpenAI as part of the requested analysis.
- Do not check personally identifiable information, health, financial information, communications, location, or user activity. Nothing is sold, used for unrelated purposes, advertising, or creditworthiness.
- The first-run disclosure obtains affirmative consent before any analysis-related data handling occurs.
- Privacy policy URL: `https://videolens.io/privacy.html`

## Assets checklist

- [x] Icon 128×128 — `public/icons/icon128.png`
- [x] Five screenshots, 1280×800 — `store-assets/screenshot-*.png`
- [x] Small promo tile 440×280 (required)
- [x] Marquee 1400×560 (optional) — `store-assets/marquee-1400x560.png`
