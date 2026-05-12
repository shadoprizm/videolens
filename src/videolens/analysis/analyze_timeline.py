from __future__ import annotations

import json

from openai import OpenAI

from videolens.analysis.modes import get_mode_prompts
from videolens.config import Models
from videolens.types import (
    Analysis,
    AnalysisMode,
    Evidence,
    Finding,
    Recommendation,
    ResolvedSource,
    Task,
    Timeline,
)


class AnalysisError(RuntimeError):
    pass


SYSTEM_PROMPT_TEMPLATE = """\
You are VideoLens, an analyst that reviews videos by reading a structured
timeline. The user provides a prompt and an analysis mode. You return a single
JSON object matching the schema below. Be faithful to evidence: every finding
should cite at least one timestamp from the timeline.

Mode-specific guidance:
{mode_instructions}

Return strict JSON with these keys (and no others):
  summary: string — {summary_guidance}
  findings: array of objects:
    - finding: string
    - evidence: array of objects with keys 'timestamp' (number, seconds) and 'detail' (string)
    - confidence: 'high' | 'medium' | 'low'
  recommendations: array of objects:
    - recommendation: string
    - rationale: string | null
    - confidence: 'high' | 'medium' | 'low'
    Guidance: {recommendations_guidance}
  tasks: array of objects:
    - title: string
    - detail: string | null
    Guidance: {tasks_guidance}
  limitations: array of strings — what you could NOT determine from the timeline.
  confidence: 'high' | 'medium' | 'low' — overall confidence in your analysis.

Do not wrap in markdown. Do not include any keys besides those listed.
"""


def analyze_timeline(
    timeline: Timeline,
    source: ResolvedSource,
    mode: AnalysisMode,
    user_prompt: str,
    client: OpenAI,
    models: Models,
) -> Analysis:
    prompts = get_mode_prompts(mode)
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        mode_instructions=prompts["instructions"],
        summary_guidance=prompts["summary"],
        recommendations_guidance=prompts["recommendations"],
        tasks_guidance=prompts["tasks"],
    )

    user_message = _build_user_message(timeline, source, mode, user_prompt, prompts["findings"])

    try:
        response = client.chat.completions.create(
            model=models.synthesize,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )
    except Exception as exc:
        raise AnalysisError(f"synthesis call failed ({models.synthesize}): {exc}") from exc

    content = response.choices[0].message.content or "{}"
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise AnalysisError(f"synthesis returned non-JSON: {exc}\n{content[:400]}") from exc

    return _to_analysis(data, source, mode, user_prompt, timeline)


def _build_user_message(
    timeline: Timeline,
    source: ResolvedSource,
    mode: AnalysisMode,
    user_prompt: str,
    findings_guidance: str,
) -> str:
    lines: list[str] = []
    lines.append(f"USER PROMPT: {user_prompt}")
    lines.append(f"ANALYSIS MODE: {mode.value}")
    lines.append(f"SOURCE TYPE: {source.source_type.value}")
    if source.title:
        lines.append(f"SOURCE TITLE: {source.title}")
    if source.limitations:
        lines.append("SOURCE LIMITATIONS:")
        for lim in source.limitations:
            lines.append(f"  - {lim}")

    lines.append("")
    lines.append(f"FINDINGS GUIDANCE: {findings_guidance}")
    lines.append("")
    lines.append("TIMELINE:")

    if not timeline.segments:
        lines.append("  (no segments)")
    else:
        for seg in timeline.segments:
            lines.append(f"[{seg.start:.1f}s — {seg.end:.1f}s] scene={seg.scene_type or '—'}")
            if seg.visual_summary:
                lines.append(f"  visual: {seg.visual_summary}")
            if seg.ocr:
                lines.append(f"  ocr: {' | '.join(seg.ocr)}")
            if seg.transcript:
                lines.append(f"  transcript: {seg.transcript}")
            lines.append(f"  confidence: {seg.confidence}")

    return "\n".join(lines)


def _to_analysis(
    data: dict,
    source: ResolvedSource,
    mode: AnalysisMode,
    user_prompt: str,
    timeline: Timeline,
) -> Analysis:
    findings = [
        Finding(
            finding=str(f.get("finding", "")).strip(),
            evidence=[
                Evidence(
                    timestamp=float(e.get("timestamp", 0.0)),
                    detail=str(e.get("detail", "")).strip(),
                )
                for e in (f.get("evidence") or [])
            ],
            confidence=_coerce_conf(f.get("confidence")),
        )
        for f in (data.get("findings") or [])
        if f.get("finding")
    ]

    recommendations = [
        Recommendation(
            recommendation=str(r.get("recommendation", "")).strip(),
            rationale=(str(r["rationale"]).strip() if r.get("rationale") else None),
            confidence=_coerce_conf(r.get("confidence")),
        )
        for r in (data.get("recommendations") or [])
        if r.get("recommendation")
    ]

    tasks = [
        Task(
            title=str(t.get("title", "")).strip(),
            detail=(str(t["detail"]).strip() if t.get("detail") else None),
        )
        for t in (data.get("tasks") or [])
        if t.get("title")
    ]

    return Analysis(
        source=source,
        mode=mode,
        prompt=user_prompt,
        summary=str(data.get("summary", "")).strip(),
        timeline=timeline,
        findings=findings,
        recommendations=recommendations,
        tasks=tasks,
        limitations=[str(x) for x in (data.get("limitations") or [])],
        confidence=_coerce_conf(data.get("confidence")),
    )


def _coerce_conf(value: object) -> str:
    v = str(value or "").strip().lower()
    return v if v in ("high", "medium", "low") else "medium"
