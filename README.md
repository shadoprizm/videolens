# VideoLens

Universal video intelligence CLI. Takes a video source (local file, direct URL, YouTube) plus a user prompt, runs a resolver → extraction → analysis pipeline, and emits a timestamped timeline plus markdown + JSON reports.

## Status

Phase 0 scaffold. Resolver classifies sources; CLI accepts arguments and writes a cache entry. Extraction (ffmpeg, yt-dlp, transcription, frame description) and analysis are not wired yet.

## Stack

- Python 3.12, uv-managed
- Typer CLI, Pydantic types, Rich for terminal output
- OpenAI cloud-only: `gpt-4o-mini-transcribe` / `gpt-4o-transcribe-diarize` for audio, `gpt-5.4-mini` for per-frame describe + OCR, `gpt-5.5` for final synthesis
- yt-dlp for source extraction, ffmpeg for frames/audio (installed separately)

## MVP scope

- Sources: local file, direct video URL, YouTube
- Modes: `general`, `bug`, `meeting`
- Outputs: `report.md`, `analysis.json`, plus timeline / transcript / frames / OCR artifacts
- File-based cache at `.videolens/cache/<hash>/`

## Usage (scaffold)

```bash
export OPENAI_API_KEY=sk-...
uv run videolens analyze ./demo.mp4 --prompt "What is happening here?" --mode general
```

## Roadmap

- **Phase 1** — yt-dlp + ffmpeg + transcription
- **Phase 2** — frame description + OCR + timeline merge
- **Phase 3** — analysis engine + markdown/JSON writers
- **Phase 4** — mode prompts (`bug`, `meeting`)
- **Phase 5** — CLI polish
- **v2** — webpage resolver, replay JSON parsers, MCP server wrapper, Q&A over cached timeline
