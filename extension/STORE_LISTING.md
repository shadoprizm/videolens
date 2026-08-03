# Chrome Web Store listing — copy & assets

Everything to paste into the Chrome Web Store developer console.

## Basics

- **Name:** VideoLens — AI Video Analysis
- **Category:** Productivity → Tools
- **Language:** English

## Summary (132 chars max)

> Turn any video into a timestamped, evidence-grounded report. Bug repros, meeting notes, UX friction. Uses your own OpenAI key.

## Description

```
VideoLens analyzes the video you're already watching and returns a structured,
timestamped report — right in Chrome's side panel.

Open a YouTube video or any HTML5 player, pick an analysis mode, and ask
anything. VideoLens samples frames, reads captions, and synthesizes an
evidence-grounded analysis where every finding cites the exact moment in the
video. Local video files work too (mp4 / webm / mov), including audio
transcription.

EIGHT ANALYSIS MODES
• Bug report — repro steps, failure modes, severity
• Meeting — decisions, commitments, follow-up actions
• UX review — user friction in session replays and screen recordings
• Tutorial — agent-ready step-by-step checklists with exact commands
• Product demo — feature inventory and positioning analysis
• Content review — hook, pacing, claims, call-to-action critique
• Privacy scan — find secrets, credentials, and PII before you share
• General — ask anything

BRING YOUR OWN KEY — TRULY PRIVATE
The entire pipeline runs inside your browser. The selected video's frames,
audio or captions, page title, and your prompt are sent to exactly one place:
OpenAI's API, using your own API key. No VideoLens
servers exist. No account, no telemetry, no analytics. Your key is stored
only on your device. A typical video costs $0.05–$1.50 in OpenAI usage,
billed straight to your own OpenAI account — estimates are shown before
every run.

PRICING
Free during early access — unlimited analyses, no account, no license key.

ALSO IN THE BOX
• Follow-up Q&A: ask more questions against the analyzed timeline for cents
• Export reports as Markdown or JSON
• Open source (MIT): github.com/shadoprizm/videolens

LIMITS WORTH KNOWING
DRM-protected players (Netflix, Disney+, etc.) cannot be captured — this is
a browser security guarantee, not a bug. Live streams are not supported.
Audio transcription of in-page videos uses the platform's caption track
(YouTube); local files are transcribed directly.
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
- Do not check personally identifiable information, health, financial information, communications, location, web history, or user activity. Nothing is sold, used for unrelated purposes, advertising, or creditworthiness.
- The first-run disclosure obtains affirmative consent before any analysis-related data handling occurs.
- Privacy policy URL: `https://videolens.io/privacy.html`

## Assets checklist

- [x] Icon 128×128 — `public/icons/icon128.png`
- [ ] Screenshots, 1280×800 (3–5): main panel on a YouTube video, progress view, results with findings, Q&A, settings/BYOK
- [ ] Small promo tile 440×280 (required)
- [ ] Marquee 1400×560 (optional)
