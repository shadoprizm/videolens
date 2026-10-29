from __future__ import annotations

import json
import math
import base64

from openai import OpenAI

from videolens.analysis.modes import get_mode_prompts
from videolens.analysis.structured import PROMPTS, normalize_report
from videolens.config import Models
from videolens.types import (
    Analysis,
    AnalysisMode,
    Frame,
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
Timeline captions are provisional model-generated observations, not verified facts. Direct images take precedence. Do not promote caption claims of sliding, stationary vehicles, lane crossings, braking or identity to facts without clear image support. Distinguish traffic beyond a separating barrier. Date, GPS and speed overlays are unverified readings, not independent measurements.
The timeline is sampled evidence, not continuous video. Missing observations are not proof an event did not occur. Describe visible changes separately from uncertainty about their cause. Scope negative findings to the supplied evidence and state what cannot be ruled out.

When heard observations are present, include a concise sound assessment in the summary and at least one timestamped acoustic finding. State whether the sounds independently corroborate the visible event or remain inconclusive. Describe only the supported acoustic qualities. Do not propose wipers, fabric, paper, braking or impact as the source of generic clicks, rumble or rustling, even as a recommendation. Never manufacture agreement between modalities. Unreported sounds do not establish absence. Do not suggest generated enhancement can recover missing factual detail; recommend inspecting the original full-resolution recording.

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
    evidence_frames: list[Frame] | None = None,
) -> Analysis:
    prompts = get_mode_prompts(mode)
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        mode_instructions=prompts["instructions"],
        summary_guidance=prompts["summary"],
        recommendations_guidance=prompts["recommendations"],
        tasks_guidance=prompts["tasks"],
    )

    if mode == AnalysisMode.RECIPE:
        system_prompt = PROMPTS["RECIPE_INSTRUCTIONS"] + "\n" + PROMPTS["RECIPE_SCHEMA"]
        system_prompt += (
            "\nVideo evidence only. No creator sources or online research are supplied."
        )
    elif mode == AnalysisMode.TUTORIAL:
        system_prompt = PROMPTS["PROCEDURE_INSTRUCTIONS"]

    user_message = _build_user_message(timeline, source, mode, user_prompt, prompts["findings"])

    user_content = user_message
    if mode == AnalysisMode.GENERAL and evidence_frames:
        images = [
            {
                "timestamp": f.timestamp,
                "url": "data:image/jpeg;base64,"
                + base64.b64encode(f.path.read_bytes()).decode("ascii"),
            }
            for f in evidence_frames
        ]
        while sum(len(f["url"]) for f in images) > 2_500_000:
            if len(images) == 1:
                images = []
                break
            images = images[::2]
        if images:
            user_content = [
                {
                    "type": "text",
                    "text": user_message
                    + "\nDirect timestamped frames follow. Recheck the descriptions against the actual images; descriptions can omit important actions. Sampled images cannot prove absence between frames.",
                }
            ]
            for f in images:
                user_content.extend(
                    [
                        {"type": "text", "text": f"Frame at {f['timestamp']:.3f} seconds"},
                        {
                            "type": "image_url",
                            "image_url": {"url": f["url"], "detail": models.frame_image_detail},
                        },
                    ]
                )
    try:
        response = client.chat.completions.create(
            model=models.synthesize,
            reasoning_effort=models.synthesize_reasoning_effort,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        )
    except Exception as exc:
        raise AnalysisError(f"synthesis call failed ({models.synthesize}): {exc}") from exc

    content = response.choices[0].message.content or "{}"
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise AnalysisError(f"synthesis returned non-JSON: {exc}\n{content[:400]}") from exc

    if not isinstance(data, dict):
        raise AnalysisError("Synthesis did not return a report object. Please retry.")
    if mode in (AnalysisMode.RECIPE, AnalysisMode.TUTORIAL):
        kind = "recipe" if mode == AnalysisMode.RECIPE else "procedure"
        structured = normalize_report(data.get(kind), kind, source.duration_seconds, timeline)
        if structured is None:
            raise AnalysisError(
                f"No usable {kind} is supported by this video. Try a video showing concrete steps."
            )
        return Analysis(
            source=source,
            mode=mode,
            prompt=user_prompt,
            timeline=timeline,
            summary=str(data.get("summary", "")).strip(),
            confidence=_coerce_conf(data.get("confidence")),
            limitations=[str(x) for x in data.get("limitations", [])]
            if isinstance(data.get("limitations"), list)
            else [],
            **{kind: structured},
        )
    if not isinstance(data.get("summary"), str) or not data["summary"].strip():
        raise AnalysisError("The AI returned an empty report. Please retry.")
    analysis = _to_analysis(data, source, mode, user_prompt, timeline)
    analysis.limitations = list(dict.fromkeys(source.limitations + analysis.limitations))
    if any("could not be analyzed" in lim for lim in source.limitations):
        analysis.confidence = "low"
    return analysis


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
    lines.append("Heard observations are independent provisional sound descriptions. Window ranges are coverage, not exact event onsets. Correlate seen and heard evidence explicitly, but generic rumble/clicks do not establish collision, braking, identity or causation. Unreported sounds are not proof of absence. If no heard observations exist, say non-speech sounds were not analyzed; captions are not sound evidence.")
    lines.append("TIMELINE:")

    if not timeline.segments:
        lines.append("  (no segments)")
    else:
        for seg in timeline.segments:
            lines.append(f"[{seg.start:.1f}s — {seg.end:.1f}s] scene={seg.scene_type or '—'}")
            if seg.audio_summary:
                lines.append(f"  heard (provisional, within this window): {seg.audio_summary}")
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
    findings = []
    removed_evidence = False
    for item in data.get("findings") or []:
        if not isinstance(item, dict) or not item.get("finding"):
            continue
        evidence = []
        for row in item.get("evidence") or []:
            if not isinstance(row, dict):
                removed_evidence = True
                continue
            timestamp = row.get("timestamp")
            detail = row.get("detail")
            if (
                isinstance(timestamp, bool)
                or not isinstance(timestamp, (int, float))
                or not math.isfinite(timestamp)
                or timestamp < 0
                or (source.duration_seconds is not None and timestamp > source.duration_seconds)
                or not any(seg.start <= timestamp <= seg.end for seg in timeline.segments)
                or not isinstance(detail, str)
                or not detail.strip()
            ):
                removed_evidence = True
                continue
            evidence.append(Evidence(timestamp=timestamp, detail=detail.strip()))
        if evidence:
            findings.append(
                Finding(
                    finding=str(item["finding"]).strip(),
                    evidence=evidence,
                    confidence=_coerce_conf(item.get("confidence")),
                )
            )
        else:
            removed_evidence = True

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
        limitations=[str(x) for x in (data.get("limitations") or [])]
        + (
            [
                "Some generated findings or citations were omitted because their timestamps could not be matched to the supplied video evidence."
            ]
            if removed_evidence
            else []
        ),
        confidence="low" if removed_evidence else _coerce_conf(data.get("confidence")),
    )


def _coerce_conf(value: object) -> str:
    v = str(value or "").strip().lower()
    return v if v in ("high", "medium", "low") else "medium"
