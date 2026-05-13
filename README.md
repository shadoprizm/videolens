# VideoLens

> Universal video intelligence. Give it a video and a prompt. Get back a timestamped timeline, evidence-grounded findings, recommendations, and a structured report — ready for human review or AI-agent consumption.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)]()

VideoLens turns any video — a bug recording, a meeting, a demo, a tutorial, a session replay — into a structured artifact an AI agent (or you) can reason over. It does this with a resolver → extraction → timeline → analysis pipeline that produces both a human-readable Markdown report and a machine-readable JSON analysis.

```bash
videolens analyze ./bug-recording.mov \
  --mode bug \
  --prompt "Identify the bug and create reproduction steps."
```

Or launch the web UI:

```bash
videolens ui
```

---

## Why VideoLens

Most "video summarizer" tools wrap Whisper and call it a day. VideoLens is built for AI agents that need to reason about video: timestamped evidence, mode-specific analysis, structured outputs, and a cached intermediate timeline so you can ask many questions against one extraction. The pipeline is modular — resolvers, processors, modes, and outputs are independent and easy to extend.

## Status

**v0.1 — alpha.** End-to-end working: local files + direct URLs + YouTube → timeline → mode-driven analysis → Markdown/JSON reports. UI included. Not production-tested at scale.

## Features

- **Multi-source input** — local files (`.mp4` / `.mov` / `.webm` / `.mkv`), direct video URLs, YouTube
- **Cloud-only pipeline** — OpenAI for transcription, frame description (+ OCR), and synthesis
- **Timestamped timeline** — every finding cites evidence at a specific second of the video
- **Three analysis modes** in v0.1: `general`, `bug`, `meeting` (UX / tutorial / product-demo / content / privacy on the roadmap)
- **Local web UI** (Streamlit) — drag-and-drop upload, mode/frame sliders, tabbed results (Report / Timeline / Frames / Transcript / Cache)
- **Per-step caching** — re-runs are cheap; per-prompt analysis cache means "ask many questions of one extraction" is free after the first
- **Cost-aware frame budgeting** — `--max-frames` caps vision-API calls; adaptive interval

## Architecture

```
Source URL or file
   │
   ▼
┌──────────┐   classifies local_file / youtube / direct_url / webpage,
│ resolver │   reports limitations clearly
└──────────┘
   │
   ▼
┌────────────┐   yt-dlp (when remote), ffprobe metadata, ffmpeg audio
│ processors │   extraction + 30 s chunking, ffmpeg frame sampling,
└────────────┘   OpenAI transcription (parallel per chunk), OpenAI vision
   │             frame describe + OCR combined (parallel per frame)
   ▼
┌──────────┐   merges frame summaries + transcript into time-windowed
│ timeline │   segments; per-segment OCR, visual, transcript, confidence
└──────────┘
   │
   ▼
┌──────────┐   one GPT-5.5 call with timeline + user prompt + mode
│ analysis │   guidance → structured Analysis (summary, findings with
└──────────┘   timestamped evidence, recommendations, tasks, limitations)
   │
   ▼
┌──────────┐
│ outputs  │   report.md + analysis.json + cached intermediate artifacts
└──────────┘
```

Each step is cached at `.videolens/cache/<source-hash>/` so re-runs are cheap. Cache key includes source content (hashed) plus extraction settings (frame interval, max frames).

## Install

Requires **Python 3.12+** and **ffmpeg** + **ffprobe** on `PATH`.

```bash
# Install ffmpeg (macOS)
brew install ffmpeg

# Clone and install with uv
git clone https://github.com/shadoprizm/videolens.git
cd videolens
uv sync --extra ui
```

Set your OpenAI API key:

```bash
export OPENAI_API_KEY=sk-...
```

(The web UI also accepts the key as a password-style input if you'd rather not put it in your environment.)

## Usage

### Web UI (recommended)

```bash
uv run videolens ui
```

Opens http://localhost:8501. Drop a video, set a prompt and mode, hit Analyze.

### Vercel deployment

Vercel runs the root FastAPI entrypoint declared in `pyproject.toml`:

```toml
[tool.vercel]
entrypoint = "app:app"
```

The Vercel deployment exposes a lightweight HTTP surface at `/` and `/api/health`.
The full upload/analyze Streamlit UI remains a local app launched with `uv run videolens ui`.
Keeping the UI dependencies in the optional `ui` extra prevents Vercel's Python
function bundle from pulling in Streamlit, pandas, pyarrow, and PDF rendering packages.

### Railway deployment

Railway is the recommended hosted path for the full Streamlit UI. The repo includes:

- `Dockerfile` — installs Python dependencies, `ffmpeg`, and PDF-rendering system libraries
- `railway.json` — tells Railway to use the Dockerfile and health-check Streamlit
- `.dockerignore` — keeps local caches, videos, and virtualenvs out of the image

In Railway:

1. Create a new project from `github.com/shadoprizm/videolens`.
2. Deploy. Railway will build with the root `Dockerfile`.
3. In Networking, generate a public domain with target port `8501`.

Do not set a shared `OPENAI_API_KEY` for the hosted app. VideoLens is BYOK:
users paste their own OpenAI key into the UI, use the tool, and the key is kept
only in that browser session.

Optional: add a Railway volume mounted at `/app/.videolens` if you want uploads
and processed-video cache files to survive redeploys.

### CLI

```bash
uv run videolens analyze <source> --prompt "<your question>" [--mode general|bug|meeting]
```

Useful flags:

| Flag | Default | Purpose |
|---|---|---|
| `--mode`, `-m` | `general` | Analysis mode |
| `--max-frames` | `40` | Hard cap on frames sent to the vision model (cost dial) |
| `--frame-interval` | `5.0` | Seconds between sampled frames (adaptive — grows if needed to respect max-frames) |
| `--output-dir`, `-o` | `./output/videolens` | Where `report.md` + `analysis.json` are written |
| `--force` | off | Bypass cache and reprocess |
| `--json` | off | Skip terminal summary printout |
| `--verbose`, `-v` | off | Verbose logging |

### Examples

```bash
# Triage a screen recording of a broken UI
videolens analyze ./broken.mov --mode bug \
  --prompt "What's broken, how do I reproduce it, and what's the severity?"

# Pull decisions and follow-ups from a meeting recording
videolens analyze ./standup.mp4 --mode meeting \
  --prompt "List the decisions made and any open follow-up actions."

# General review of a tutorial or demo
videolens analyze "https://www.youtube.com/watch?v=..." \
  --prompt "What does this demo show and what are the strengths and weaknesses?"
```

## Modes in v0.1

| Mode | Use it for |
|---|---|
| `general` | Broad review: what's happening, what's notable, what's worth knowing |
| `bug` | Bug recordings → repro steps, severity hint, ticket-ready summary |
| `meeting` | Calls/standups/briefings → decisions, objections, commitments, follow-ups (uses diarized transcription) |

Each mode is a small prompt-fragment file under `src/videolens/analysis/modes/`. Adding a new mode is ~30 lines.

## Models (configurable)

Defaults are in `src/videolens/config.py`:

| Stage | Model |
|---|---|
| Transcription (general/bug) | `gpt-4o-mini-transcribe` |
| Transcription (meeting) | `gpt-4o-transcribe-diarize` |
| Frame describe + OCR (per frame) | `gpt-5.4-mini` |
| Final analysis synthesis | `gpt-5.5` |

Swap them by editing the `Models` dataclass.

## Cost guide

Rough order-of-magnitude:

- A 30-second video with 5 frames → well under $0.05
- A 5-minute video with 20 frames → typically under $0.20
- A 30-minute meeting with 40 frames → typically $0.50–$1.50

Per-prompt analysis cache means asking a second question of an already-extracted video costs only the synthesis call (cents).

## MCP server (Claude Code / Cursor / Windsurf)

VideoLens ships a [Model Context Protocol](https://modelcontextprotocol.io) server so AI agents can analyse videos as a first-class tool.

```bash
uv sync --extra mcp
```

Available tools:

| Tool | What it does |
|---|---|
| `analyze_video` | Run the full pipeline against a source + prompt + mode |
| `ask_video` | Follow-up question against a previously analysed video |
| `get_timeline` | Fetch the cached timeline (segments with visual/OCR/transcript) |
| `get_transcript` | Fetch the cached transcript |
| `get_frames` | Fetch frame summaries |
| `list_cached` | List all videos with cached extraction artifacts |

Add it to Claude Code:

```bash
claude mcp add videolens -- videolens-mcp
```

Or wire it into Cursor / Windsurf / any MCP-aware host the same way as any stdio MCP server.

## Roadmap

- **Robustness:** soft-fail transcription so frame-only videos still produce a report; clearer error surfaces in the UI
- **More sources:** webpage-rendered embedded video (Playwright), session-replay JSON exports (PostHog / Clarity / Hotjar / FullStory / LogRocket / OpenReplay), Zoom/Meet/Teams recordings
- **Scene-change frame selection:** smarter than the adaptive interval used in v0.1
- **Embeddings + semantic search** over processed timelines

## Contributing

Issues and PRs welcome. The architecture is modular by design — most additions land in their own file under `resolvers/`, `processors/`, `analysis/modes/`, or `outputs/` without touching the rest.

## License

MIT — see [LICENSE](LICENSE).
