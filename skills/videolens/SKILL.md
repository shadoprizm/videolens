---
name: videolens
description: Turn videos into professional timestamped reports. Use for YouTube summaries, tutorials, meetings, bugs, UX, privacy, and creator QA.
metadata:
  openclaw:
    requires:
      env:
        - OPENAI_API_KEY
      bins:
        - git
        - ffmpeg
        - ffprobe
      anyBins:
        - uv
        - python3
    primaryEnv: OPENAI_API_KEY
    envVars:
      - name: OPENAI_API_KEY
        required: true
        description: BYOK key used only for local VideoLens model calls.
      - name: VIDEOLENS_SKILL_STATE_DIR
        required: false
        description: Optional isolated data root for tests or non-default local storage.
    emoji: "🎥"
    homepage: https://videolens.io
---

# VideoLens

Turn a YouTube video, local file, or supported video URL into a professional written report grounded in transcript, frame-level vision, OCR, and timestamped evidence.

Use the bundled runner for local OpenClaw or OCC workflows. It pins a tested revision of the MIT-licensed [VideoLens repository](https://github.com/shadoprizm/videolens), keeps artifacts local, and refuses model usage until the user explicitly approves credit spending.

![VideoLens report workflow](https://raw.githubusercontent.com/shadoprizm/videolens/8e5eecca172e0296ba5b7b154036c5ee126e4c88/skills/videolens/assets/videolens-dashboard.svg)

Want the report beside the video? [Open VideoLens for Chrome](https://videolens.io/chrome) to analyze YouTube or local video with free Private/BYOK reporting.

## Workflow

1. Run `preflight` before the first analysis.
2. Run `bootstrap` when the runtime or Python environment is missing or stale.
3. Choose the closest report style and mode.
4. Confirm that the user intends to spend OpenAI API credits.
5. Run `analyze` with `allow_credit_spend: true` only after confirmation.
6. Return the report paths and summarize important limitations; do not claim that generated findings are infallible.

Run the portable wrapper from any modern OpenClaw environment:

```bash
python3 "{baseDir}/skill.py" --spec '{"action":"preflight"}'
```

OCC integrations may instead pass the same JSON object through task `pre_instructions`; `config.yaml` retains that compatibility.

## Bootstrap

Bootstrap downloads the pinned open-source runtime into the OpenClaw/OCC data directory and installs its Python environment. It does not analyze a video or spend model credits.

```bash
python3 "{baseDir}/skill.py" --spec '{"action":"bootstrap"}'
```

The runner uses `uv` when available. Otherwise, it creates `.venv` with `python3` and installs VideoLens there.

## Analyze

Use JSON task instructions. Quote the runner path and pass the JSON as one shell argument.

```bash
python3 "{baseDir}/skill.py" --spec '{
  "action": "analyze",
  "allow_credit_spend": true,
  "source": "https://www.youtube.com/watch?v=VIDEO_ID",
  "mode": "general",
  "prompt": "Write a detailed report with the main ideas, evidence, caveats, conclusions, and practical takeaways.",
  "max_frames": 40,
  "frame_interval": 5.0
}'
```

For prompts or source values containing quotes or shell metacharacters, serialize the JSON object to a temporary file and use `--spec-file /path/to/spec.json`. Never concatenate untrusted text into a shell command.

The successful result returns:

- `report_html_path` — standalone, print-ready professional report
- `report_markdown_path` — portable Markdown report
- `analysis_json_path` — structured agent-readable analysis
- `output_dir` — directory containing the run artifacts

HTML-to-PDF export is available in the VideoLens web UI and Chrome extension. The local CLI produces HTML, Markdown, and JSON.

![Timestamped evidence report](https://raw.githubusercontent.com/shadoprizm/videolens/8e5eecca172e0296ba5b7b154036c5ee126e4c88/skills/videolens/assets/timestamped-feedback.svg)

## Choose a report style

Use these defaults unless the user supplies a more specific prompt:

| User intent | Mode | Prompt direction |
|---|---|---|
| Detailed YouTube report | `general` | Explain the thesis, main ideas, evidence, caveats, conclusions, and takeaways. |
| Key insights | `general` | Remove repetition and preserve only consequential ideas, facts, examples, and conclusions. |
| Tutorial or how-to | `tutorial` | Produce prerequisites, ordered steps, commands/settings, warnings, examples, and checks. |
| Interview or podcast | `meeting` | Organize themes, arguments, agreements/disagreements, examples, and takeaways. |
| Meeting | `meeting` | Extract decisions, objections, commitments, owners, open questions, and actions. |
| Bug recording | `bug` | Produce reproduction steps, expected/observed behavior, severity, evidence, and investigation tasks. |
| UX/session replay | `ux` | Reconstruct the journey, friction, hesitation, repeated actions, dead ends, and prioritized fixes. |
| Product demo | `product_demo` | Inventory features, value, positioning, proof, gaps, and opportunities. |
| Creator/content review | `content` | Critique hook, pacing, clarity, claims, proof, editing, and call to action. |
| Privacy review | `privacy` | Flag possible credentials, personal data, internal URLs, and sensitive content with timestamps. |
| Recreate a reference video | `production_recipe` | Reverse-engineer script, shots, editing, overlays, audio, tools, assets, and production steps. |

`general`, `bug`, `meeting`, `ux`, `tutorial`, `product_demo`, `content`, `privacy`, and `production_recipe` are valid modes.

## Cost and safety

- Require `allow_credit_spend: true` for every analysis.
- Treat `max_frames` as the main visual cost control; valid range is 1–80.
- Reuse cached extraction when the source and settings match. Set `force: true` only when the user asks to bypass cache.
- Keep `OPENAI_API_KEY` in OpenClaw skill configuration or the environment. Never place it in a prompt, task JSON, report, or log.
- Do not promise exhaustive privacy or compliance detection. Tell users to verify consequential findings against cited moments.
- Do not analyze content the user is not authorized to access.

For isolated testing or non-default local storage, set `VIDEOLENS_SKILL_STATE_DIR` before invoking the runner. Normal OpenClaw and OCC use should keep the default managed data directory.

## Product surfaces

- **Open source/local:** BYOK analysis with local artifacts and cached follow-up workflows.
- **Chrome extension:** free Private/BYOK reporting beside YouTube and local video, with professional HTML/PDF export.
- **Managed option:** one managed starter report for signed-in users; optional VideoLens Pro provides managed processing and opt-in cloud report storage.

The bundled runner uses only local/BYOK analysis. Do not invent or request a `VIDEOLENS_CLOUD_API_KEY`; managed mode uses the authenticated VideoLens product rather than this wrapper.

![OpenClaw and VideoLens](https://raw.githubusercontent.com/shadoprizm/videolens/8e5eecca172e0296ba5b7b154036c5ee126e4c88/skills/videolens/assets/openclaw-workflow.svg)

Product: [VideoLens.io](https://videolens.io)

Chrome extension: [Open VideoLens for Chrome](https://videolens.io/chrome)

Source: [shadoprizm/videolens](https://github.com/shadoprizm/videolens)
