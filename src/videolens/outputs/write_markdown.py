from __future__ import annotations

from pathlib import Path

from videolens.types import Analysis


def render_markdown(analysis: Analysis) -> str:
    lines: list[str] = []
    src = analysis.source

    lines.append("# Video Intelligence Report")
    lines.append("")
    lines.append("## Source")
    lines.append(f"- **URL / path:** {src.source_url}")
    lines.append(f"- **Type:** {src.source_type.value}")
    lines.append(f"- **Access:** {src.access_level.value}")
    if src.title:
        lines.append(f"- **Title:** {src.title}")
    if src.author:
        lines.append(f"- **Author:** {src.author}")
    if src.duration_seconds is not None:
        lines.append(f"- **Duration:** {src.duration_seconds:.1f}s")
    lines.append(f"- **Mode:** {analysis.mode.value}")
    lines.append(f"- **Prompt:** {analysis.prompt}")
    lines.append(f"- **Overall confidence:** {analysis.confidence}")
    lines.append("")

    lines.append("## Executive Summary")
    lines.append("")
    lines.append(analysis.summary or "_(no summary)_")
    lines.append("")

    lines.append("## Findings")
    lines.append("")
    if not analysis.findings:
        lines.append("_(no findings)_")
    else:
        for i, f in enumerate(analysis.findings, 1):
            lines.append(f"### {i}. {f.finding}")
            lines.append(f"*Confidence: {f.confidence}*")
            lines.append("")
            if f.evidence:
                lines.append("**Evidence:**")
                for e in f.evidence:
                    lines.append(f"- `{_fmt_ts(e.timestamp)}` — {e.detail}")
                lines.append("")
    lines.append("")

    lines.append("## Recommendations")
    lines.append("")
    if not analysis.recommendations:
        lines.append("_(none)_")
    else:
        for i, r in enumerate(analysis.recommendations, 1):
            lines.append(f"{i}. **{r.recommendation}**  ")
            if r.rationale:
                lines.append(f"   _{r.rationale}_  ")
            lines.append(f"   Confidence: {r.confidence}")
            lines.append("")

    lines.append("## Tasks")
    lines.append("")
    if not analysis.tasks:
        lines.append("_(none)_")
    else:
        for t in analysis.tasks:
            if t.detail:
                lines.append(f"- [ ] **{t.title}** — {t.detail}")
            else:
                lines.append(f"- [ ] {t.title}")
    lines.append("")

    lines.append("## Timeline")
    lines.append("")
    if not analysis.timeline.segments:
        lines.append("_(empty)_")
    else:
        lines.append("| Start | End | Scene | Visual | OCR | Transcript | Conf |")
        lines.append("|---|---|---|---|---|---|---|")
        for s in analysis.timeline.segments:
            visual = (s.visual_summary or "").replace("\n", " ").replace("|", "\\|")
            transcript = (s.transcript or "").replace("\n", " ").replace("|", "\\|")
            ocr = " · ".join(s.ocr).replace("|", "\\|")
            lines.append(
                f"| {_fmt_ts(s.start)} | {_fmt_ts(s.end)} | {s.scene_type or '—'} | "
                f"{visual} | {ocr} | {transcript} | {s.confidence} |"
            )
    lines.append("")

    lines.append("## Limitations")
    lines.append("")
    combined = list(src.limitations) + list(analysis.limitations)
    if not combined:
        lines.append("_(none)_")
    else:
        for lim in combined:
            lines.append(f"- {lim}")
    lines.append("")

    return "\n".join(lines)


def write_markdown(analysis: Analysis, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(render_markdown(analysis))
    return dest


def _fmt_ts(seconds: float) -> str:
    s = max(0.0, float(seconds))
    minutes = int(s // 60)
    secs = s - minutes * 60
    return f"{minutes:02d}:{secs:05.2f}"
