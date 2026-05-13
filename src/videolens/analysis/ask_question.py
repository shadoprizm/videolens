from __future__ import annotations

from dataclasses import dataclass

from openai import OpenAI

from videolens.config import Models
from videolens.types import Analysis, AnalysisMode, Timeline


class AskQuestionError(RuntimeError):
    pass


SYSTEM_PROMPT = """\
You are VideoLens, answering a follow-up question about a video the user has
already analysed. You have access to:
- The timeline of the video (frame summaries + transcript by time window).
- The prior analysis the user got (summary, findings, recommendations).
- The user's original prompt and chosen analysis mode.

Answer the new question grounded in the timeline. Cite specific timestamps
inline in the format `[MM:SS]` whenever you reference something visible or
spoken. Distinguish what is directly observed from what you are inferring.

If the timeline does not contain enough information to answer confidently,
say so plainly — do not speculate. If the question implies the user wants
recommendations, end with a short "Recommendations:" list.

Be terse, concrete, and structured. Use short paragraphs and bullet points.
Never repeat the existing executive summary verbatim — assume the user has
read it already.
"""


@dataclass
class Answer:
    question: str
    answer: str


def ask_question(
    question: str,
    timeline: Timeline,
    prior_analysis: Analysis | None,
    client: OpenAI,
    models: Models,
) -> str:
    question = (question or "").strip()
    if not question:
        raise AskQuestionError("Empty question — nothing to ask.")

    user_message = _build_user_message(question, timeline, prior_analysis)

    try:
        response = client.chat.completions.create(
            model=models.synthesize,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
        )
    except Exception as exc:
        raise AskQuestionError(f"Q&A call failed ({models.synthesize}): {exc}") from exc

    return (response.choices[0].message.content or "").strip()


def _build_user_message(
    question: str,
    timeline: Timeline,
    prior_analysis: Analysis | None,
) -> str:
    lines: list[str] = []

    if prior_analysis is not None:
        lines.append(f"ORIGINAL USER PROMPT: {prior_analysis.prompt}")
        lines.append(f"ANALYSIS MODE: {prior_analysis.mode.value}")
        lines.append("")
        lines.append("PRIOR EXECUTIVE SUMMARY:")
        lines.append(prior_analysis.summary or "(none)")

        if prior_analysis.findings:
            lines.append("")
            lines.append("PRIOR FINDINGS (one per line for context only — do not repeat):")
            for f in prior_analysis.findings[:8]:
                lines.append(f"- {f.finding} ({f.confidence})")

    lines.append("")
    lines.append("TIMELINE:")
    if not timeline.segments:
        lines.append("  (empty)")
    else:
        for seg in timeline.segments:
            ts = f"[{_fmt(seg.start)}–{_fmt(seg.end)}]"
            lines.append(f"{ts} scene={seg.scene_type or '—'}")
            if seg.visual_summary:
                lines.append(f"  visual: {seg.visual_summary}")
            if seg.ocr:
                lines.append(f"  ocr: {' | '.join(seg.ocr)}")
            if seg.transcript:
                lines.append(f"  transcript: {seg.transcript}")

    lines.append("")
    lines.append(f"NEW QUESTION: {question}")
    lines.append("")
    lines.append("ANSWER (cite timestamps inline as [MM:SS]):")
    return "\n".join(lines)


def _fmt(seconds: float) -> str:
    s = max(0.0, float(seconds))
    minutes = int(s // 60)
    secs = int(s - minutes * 60)
    return f"{minutes:02d}:{secs:02d}"
