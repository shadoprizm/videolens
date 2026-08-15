from __future__ import annotations

from dataclasses import dataclass

from videolens.types import (
    AccessLevel,
    Analysis,
    AnalysisMode,
    ArtifactsAvailable,
    Evidence,
    Finding,
    Recommendation,
    ResolvedSource,
    Task,
    Timeline,
    TimelineSegment,
)


@dataclass(frozen=True)
class WorkflowPreset:
    mode: AnalysisMode
    label: str
    short_label: str
    description: str
    prompt: str


WORKFLOW_PRESETS: dict[str, WorkflowPreset] = {
    "detailed": WorkflowPreset(
        mode=AnalysisMode.GENERAL,
        label="Create a detailed written report",
        short_label="Detailed report",
        description="A thorough summary, main ideas, supporting evidence, conclusions, and useful context.",
        prompt=(
            "Turn this video into a detailed written report. Explain the central thesis, organize the "
            "main ideas into clear sections, preserve important facts, examples, arguments, caveats, "
            "and conclusions, and finish with practical takeaways. Cite the supporting moments with "
            "timestamps and include important information shown visually as well as spoken."
        ),
    ),
    "key_insights": WorkflowPreset(
        mode=AnalysisMode.GENERAL,
        label="Extract the important information",
        short_label="Key insights",
        description="The essential ideas, facts, examples, and conclusions without the filler.",
        prompt=(
            "Extract the most important information from this video. Focus on the ideas, facts, "
            "examples, arguments, and conclusions worth remembering; remove repetition and filler. "
            "Explain why each insight matters and cite the exact supporting timestamps."
        ),
    ),
    "tutorial": WorkflowPreset(
        mode=AnalysisMode.TUTORIAL,
        label="Turn the video into a written guide",
        short_label="Tutorial guide",
        description="Ordered steps, prerequisites, commands, warnings, examples, and verification checks.",
        prompt=(
            "Convert this video into a complete written guide. Include prerequisites, tools, ordered "
            "steps, exact commands or settings, explanations, examples, warnings, and verification "
            "checks. Preserve important visual details and cite the relevant timestamps."
        ),
    ),
    "interview": WorkflowPreset(
        mode=AnalysisMode.MEETING,
        label="Create an interview or podcast brief",
        short_label="Interview / podcast",
        description="Themes, arguments, notable quotes in paraphrase, disagreements, examples, and takeaways.",
        prompt=(
            "Turn this interview or podcast into a structured written brief. Identify the main themes, "
            "each speaker's important arguments, points of agreement or disagreement, memorable examples, "
            "and conclusions. Paraphrase rather than quoting at length and cite key timestamps."
        ),
    ),
    "general": WorkflowPreset(
        mode=AnalysisMode.GENERAL,
        label="Understand any video with evidence",
        short_label="General analysis",
        description="A flexible summary, important moments, conclusions, and follow-up questions.",
        prompt=(
            "Explain what happens in this video, what is most important, and what is worth remembering. "
            "Ground the report in transcript and visual evidence and cite specific timestamps."
        ),
    ),
    "meeting": WorkflowPreset(
        mode=AnalysisMode.MEETING,
        label="Extract meeting decisions and owners",
        short_label="Meeting notes",
        description="Decisions, objections, commitments, open questions, and accountable follow-ups.",
        prompt=(
            "Extract the decisions, objections, commitments, unresolved questions, owners, and follow-up "
            "actions from this meeting. Cite the discussion behind each consequential item."
        ),
    ),
    "product_demo": WorkflowPreset(
        mode=AnalysisMode.PRODUCT_DEMO,
        label="Analyze a product demonstration",
        short_label="Product demo",
        description="Feature inventory, positioning, proof, gaps, and product opportunities.",
        prompt=(
            "Analyze this product demo for features shown, customer value, positioning, proof, gaps, and "
            "product opportunities. Cite the moments that support each conclusion."
        ),
    ),
    "content": WorkflowPreset(
        mode=AnalysisMode.CONTENT,
        label="Improve video content",
        short_label="Content review",
        description="Hook, pacing, clarity, claims, proof, editing opportunities, and call to action.",
        prompt=(
            "Critique this video's hook, pacing, clarity, structure, claims, proof, and call to action. "
            "Recommend precise edits and cite the relevant timestamps."
        ),
    ),
    "privacy": WorkflowPreset(
        mode=AnalysisMode.PRIVACY,
        label="Review possible privacy exposure",
        short_label="Privacy review",
        description="Potential credentials, personal data, internal URLs, and a timestamped redaction plan.",
        prompt=(
            "Review this video for possible credentials, personal data, private messages, internal URLs, "
            "customer information, or other sensitive material. Produce a prioritized timestamped review "
            "and redaction checklist. Do not claim the review guarantees complete detection."
        ),
    ),
    "production_recipe": WorkflowPreset(
        mode=AnalysisMode.PRODUCTION_RECIPE,
        label="Recreate how a reference video was made",
        short_label="Production recipe",
        description="Script spine, shot inventory, edit rhythm, tools, assets, and a recreation plan.",
        prompt=(
            "Reverse-engineer how this video itself was made. Identify its format, script spine, shot "
            "inventory, edit rhythm, overlays, audio, likely tools with confidence levels, required "
            "assets, and a practical step-by-step recreation recipe. Cite the visible evidence."
        ),
    ),
    "bug": WorkflowPreset(
        mode=AnalysisMode.BUG,
        label="Create a bug report",
        short_label="Bug report",
        description="Reproduction steps, expected versus observed behavior, severity, and timestamped evidence.",
        prompt=(
            "Turn this recording into an issue-ready bug report. Identify the user's goal, "
            "reproduction steps, expected versus observed behavior, visible errors, likely severity, "
            "and recommended investigation tasks. Cite every important claim with a timestamp."
        ),
    ),
    "ux": WorkflowPreset(
        mode=AnalysisMode.UX,
        label="Review UX friction",
        short_label="UX review",
        description="Pauses, repeated actions, confusing copy, dead ends, and prioritized product fixes.",
        prompt=(
            "Review this recording for UX friction. Reconstruct the user's goal and journey, identify "
            "hesitation, repeated actions, confusing states, errors, and abandonment risks, then propose "
            "specific product fixes. Cite each finding with a timestamp."
        ),
    ),
}


PRIMARY_WORKFLOWS = ("detailed", "key_insights", "tutorial", "interview")


def preset_for(value: str | None) -> WorkflowPreset:
    return WORKFLOW_PRESETS.get(value or "", WORKFLOW_PRESETS["detailed"])


def preset_for_mode(mode: AnalysisMode | str) -> WorkflowPreset:
    mode_value = mode.value if isinstance(mode, AnalysisMode) else mode
    return next(
        (preset for preset in WORKFLOW_PRESETS.values() if preset.mode.value == mode_value),
        WORKFLOW_PRESETS["general"],
    )


def render_report_markdown(analysis: Analysis) -> str:
    lines = [
        f"# {analysis.source.title or 'Video report'}",
        "",
        "## Executive summary",
        "",
        analysis.summary.strip() or "_(No summary generated.)_",
        "",
        "## Key findings and evidence",
        "",
    ]

    if not analysis.findings:
        lines.append("_(No findings generated.)_")
    for index, finding in enumerate(analysis.findings, 1):
        lines.extend(
            [
                f"### {index}. {finding.finding}",
                f"**Confidence:** {finding.confidence}",
                "",
            ]
        )
        for evidence in finding.evidence:
            lines.append(f"- **[{_fmt_ts(evidence.timestamp)}]** {evidence.detail}")
        lines.append("")

    lines.extend(["## Practical takeaways", ""])
    if analysis.recommendations:
        for recommendation in analysis.recommendations:
            rationale = f" — {recommendation.rationale}" if recommendation.rationale else ""
            lines.append(f"- {recommendation.recommendation}{rationale}")
    else:
        lines.append("_(No recommendations generated.)_")

    lines.extend(["", "## Follow-up ideas", ""])
    if analysis.tasks:
        for task in analysis.tasks:
            detail = f" — {task.detail}" if task.detail else ""
            lines.append(f"- [ ] **{task.title}**{detail}")
    else:
        lines.append("_(No tasks generated.)_")

    lines.extend(
        [
            "",
            "## Report notes",
            "",
            f"- Overall confidence: **{analysis.confidence}**",
            "- Generated from transcript and visual evidence by VideoLens; check cited moments against the source before relying on consequential details.",
        ]
    )
    for limitation in analysis.limitations:
        lines.append(f"- {limitation}")
    return "\n".join(lines).strip() + "\n"


def render_issue_markdown(analysis: Analysis) -> str:
    """Compatibility alias for integrations that used the original export helper."""
    return render_report_markdown(analysis)


def build_demo_analysis() -> Analysis:
    source = ResolvedSource(
        source_url="illustrative-sample://youtube-report",
        source_type="youtube",
        access_level=AccessLevel.FULL_VIDEO,
        artifacts_available=ArtifactsAvailable(
            video=True,
            audio=True,
            transcript=True,
            frames=True,
            ocr=True,
            metadata=True,
        ),
        title="Why most note-taking systems fail",
        duration_seconds=872.0,
        platform="youtube",
    )
    timeline = Timeline(
        segments=[
            TimelineSegment(
                start=0,
                end=142,
                scene_type="opening thesis",
                transcript="The problem is not capturing more notes. It is being able to find and use the right idea when a real question appears.",
                visual_summary="The presenter contrasts a large archive of clipped notes with a small working set tied to current questions.",
                confidence="high",
            ),
            TimelineSegment(
                start=142,
                end=356,
                scene_type="collector's fallacy",
                transcript="Saving an idea feels like learning, but the decision to save it is not the same as understanding or retrieving it later.",
                ocr=["Capture ≠ understanding", "The collector's fallacy"],
                visual_summary="A diagram separates passive capture from active explanation, retrieval, and application.",
                confidence="high",
            ),
            TimelineSegment(
                start=356,
                end=618,
                scene_type="question-led organization",
                transcript="Organize notes around questions and projects, not around the source that happened to contain them.",
                ocr=["Active question → evidence → conclusion"],
                visual_summary="The presenter moves notes from source folders into a project page containing an open question, evidence, and a draft conclusion.",
                confidence="high",
            ),
            TimelineSegment(
                start=618,
                end=872,
                scene_type="weekly synthesis workflow",
                transcript="Once a week, turn the few notes that still matter into your own words, a decision, or something you publish.",
                ocr=["Weekly: delete, connect, decide, create"],
                visual_summary="A four-step weekly review converts captured material into linked ideas, decisions, and written output.",
                detected_actions=[
                    "review recent notes",
                    "rewrite in own words",
                    "connect to active work",
                ],
                confidence="high",
            ),
        ]
    )
    return Analysis(
        source=source,
        mode=AnalysisMode.GENERAL,
        prompt=WORKFLOW_PRESETS["detailed"].prompt,
        summary=(
            "The video argues that most note-taking systems fail because they optimize capture rather "
            "than retrieval and use. Its proposed alternative is a small, question-led working set: "
            "save selectively, organize evidence around active problems, and synthesize useful notes "
            "into decisions or original work during a weekly review."
        ),
        timeline=timeline,
        findings=[
            Finding(
                finding="More capture does not produce more understanding.",
                evidence=[
                    Evidence(
                        timestamp=48,
                        detail="The presenter defines the goal as retrieving and using an idea when a real question appears, not maximizing the archive.",
                    ),
                    Evidence(
                        timestamp=174,
                        detail="The visual model explicitly separates capture from understanding, retrieval, and application.",
                    ),
                ],
                confidence="high",
            ),
            Finding(
                finding="Questions and active projects are better organizing units than sources.",
                evidence=[
                    Evidence(
                        timestamp=382,
                        detail="The presenter recommends moving notes out of book and video folders and into the question they help answer.",
                    ),
                    Evidence(
                        timestamp=467,
                        detail="A worked example groups several sources beneath one active question, followed by evidence and a draft conclusion.",
                    ),
                ],
                confidence="high",
            ),
            Finding(
                finding="A weekly synthesis habit turns stored material into usable knowledge.",
                evidence=[
                    Evidence(
                        timestamp=654,
                        detail="The weekly review asks whether each recent note should be deleted, connected, turned into a decision, or developed into an output.",
                    ),
                    Evidence(
                        timestamp=791,
                        detail="The closing example rewrites three captured fragments into a short original explanation connected to an active project.",
                    ),
                ],
                confidence="high",
            ),
        ],
        recommendations=[
            Recommendation(
                recommendation="Capture fewer notes and attach each one to a current question.",
                rationale="The video's system depends on a small working set with a reason for retrieval.",
                confidence="high",
            ),
            Recommendation(
                recommendation="Schedule a short weekly synthesis review.",
                rationale="Rewriting, connecting, deciding, or creating is the step that converts saved material into knowledge.",
                confidence="high",
            ),
        ],
        tasks=[
            Task(
                title="Choose one active question",
                detail="Move only the notes that directly help answer it into a working page.",
            ),
            Task(
                title="Rewrite the strongest evidence in your own words",
                detail="Add the source timestamp so the reasoning remains checkable.",
            ),
            Task(
                title="Run the weekly delete-connect-decide-create review",
                detail="End by producing one decision, explanation, or draft from the material.",
            ),
        ],
        limitations=[
            "This illustrative report is precomputed from a fictional educational YouTube video; real reports depend on the accessible transcript, frames, and source quality."
        ],
        confidence="high",
    )


def _fmt_ts(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    return f"{total // 60:02d}:{total % 60:02d}"
