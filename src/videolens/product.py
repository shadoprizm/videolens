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
    "bug": WorkflowPreset(
        mode=AnalysisMode.BUG,
        label="Create an issue-ready bug report",
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
        label="Find UX friction and abandoned flows",
        short_label="UX review",
        description="Pauses, repeated actions, confusing copy, dead ends, and prioritized product fixes.",
        prompt=(
            "Review this recording for UX friction. Reconstruct the user's goal and journey, identify "
            "hesitation, repeated actions, confusing states, errors, and abandonment risks, then propose "
            "specific product fixes. Cite each finding with a timestamp."
        ),
    ),
    "general": WorkflowPreset(
        mode=AnalysisMode.GENERAL,
        label="Understand any video with evidence",
        short_label="General analysis",
        description="A concise summary, important moments, recommendations, and follow-up tasks.",
        prompt=(
            "Review this video and explain what happens, what is most important, and what actions should "
            "follow. Ground the findings in transcript or visual evidence and cite specific timestamps."
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
    "tutorial": WorkflowPreset(
        mode=AnalysisMode.TUTORIAL,
        label="Turn a tutorial into a checklist",
        short_label="Tutorial steps",
        description="Ordered steps, prerequisites, commands, warnings, and an agent-ready checklist.",
        prompt=(
            "Convert this tutorial into a complete ordered checklist. Include prerequisites, tools, exact "
            "commands or settings, warnings, and verification steps, all grounded in timestamps."
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
}


PRIMARY_WORKFLOWS = ("bug", "ux", "general")


def preset_for(value: str | None) -> WorkflowPreset:
    return WORKFLOW_PRESETS.get(value or "", WORKFLOW_PRESETS["bug"])


def preset_for_mode(mode: AnalysisMode | str) -> WorkflowPreset:
    mode_value = mode.value if isinstance(mode, AnalysisMode) else mode
    return next(
        (preset for preset in WORKFLOW_PRESETS.values() if preset.mode.value == mode_value),
        WORKFLOW_PRESETS["general"],
    )


def render_issue_markdown(analysis: Analysis) -> str:
    lines = [
        f"# {analysis.summary.strip() or 'VideoLens finding'}",
        "",
        "## Summary",
        "",
        analysis.summary.strip() or "_(No summary generated.)_",
        "",
        "## Findings and evidence",
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

    lines.extend(["## Recommended actions", ""])
    if analysis.recommendations:
        for recommendation in analysis.recommendations:
            rationale = f" — {recommendation.rationale}" if recommendation.rationale else ""
            lines.append(f"- {recommendation.recommendation}{rationale}")
    else:
        lines.append("_(No recommendations generated.)_")

    lines.extend(["", "## Suggested tasks", ""])
    if analysis.tasks:
        for task in analysis.tasks:
            detail = f" — {task.detail}" if task.detail else ""
            lines.append(f"- [ ] **{task.title}**{detail}")
    else:
        lines.append("_(No tasks generated.)_")

    lines.extend(
        [
            "",
            "## Review notes",
            "",
            f"- Overall confidence: **{analysis.confidence}**",
            "- Generated from video evidence by VideoLens; verify cited moments before filing or assigning.",
        ]
    )
    for limitation in analysis.limitations:
        lines.append(f"- {limitation}")
    return "\n".join(lines).strip() + "\n"


def build_demo_analysis() -> Analysis:
    source = ResolvedSource(
        source_url="illustrative-sample://checkout-recording",
        source_type="local_file",
        access_level=AccessLevel.FULL_VIDEO,
        artifacts_available=ArtifactsAvailable(
            video=True,
            audio=True,
            transcript=True,
            frames=True,
            ocr=True,
            metadata=True,
        ),
        title="Illustrative checkout recording",
        duration_seconds=32.0,
        platform="sample",
    )
    timeline = Timeline(
        segments=[
            TimelineSegment(
                start=0,
                end=8,
                scene_type="checkout form",
                transcript="I am updating the card on this account.",
                visual_summary="The user opens Billing and completes the payment-method form.",
                confidence="high",
            ),
            TimelineSegment(
                start=8,
                end=17,
                scene_type="form submission",
                transcript="I clicked save, but it is still spinning.",
                ocr=["Save payment method", "Saving…"],
                visual_summary="The Save button enters a loading state and remains there for several seconds.",
                detected_actions=["click Save payment method", "wait for response"],
                confidence="high",
            ),
            TimelineSegment(
                start=17,
                end=25,
                scene_type="error state",
                transcript="Now it says something went wrong, but it does not tell me what to fix.",
                ocr=["Something went wrong. Try again."],
                visual_summary="A generic error banner appears while the entered form values remain visible.",
                confidence="high",
            ),
            TimelineSegment(
                start=25,
                end=32,
                scene_type="retry",
                transcript="Trying again gives me the same error.",
                visual_summary="The user retries without changing the form and receives the same result.",
                detected_actions=["retry submission"],
                confidence="medium",
            ),
        ]
    )
    return Analysis(
        source=source,
        mode=AnalysisMode.BUG,
        prompt=WORKFLOW_PRESETS["bug"].prompt,
        summary=(
            "Updating a saved payment method fails after submission: the interface remains in a loading "
            "state, then shows a generic error with no field-level guidance or recovery path."
        ),
        timeline=timeline,
        findings=[
            Finding(
                finding="Payment-method submission stalls before failing.",
                evidence=[
                    Evidence(
                        timestamp=10,
                        detail="The user clicks “Save payment method”; the control changes to “Saving…” and remains busy.",
                    ),
                    Evidence(
                        timestamp=18,
                        detail="The loading state ends with the banner “Something went wrong. Try again.”",
                    ),
                ],
                confidence="high",
            ),
            Finding(
                finding="The failure state does not explain what the user can correct.",
                evidence=[
                    Evidence(
                        timestamp=19,
                        detail="The only feedback is a generic banner; no field is marked invalid and no support reference is shown.",
                    ),
                    Evidence(
                        timestamp=27,
                        detail="A retry with unchanged inputs produces the same failure.",
                    ),
                ],
                confidence="high",
            ),
        ],
        recommendations=[
            Recommendation(
                recommendation="Return an actionable error state and preserve retry context.",
                rationale="Map known payment errors to the affected field and include a support reference for unknown failures.",
                confidence="high",
            ),
            Recommendation(
                recommendation="Add submission tracing around the payment-method update request.",
                rationale="The recording proves the visible failure but cannot identify the network or backend cause.",
                confidence="high",
            ),
        ],
        tasks=[
            Task(
                title="Reproduce the update-payment-method request",
                detail="Capture the response status, payment-provider code, and correlation ID.",
            ),
            Task(
                title="Design field-level and fallback error states",
                detail="Cover validation, declined-card, provider, network, and unknown errors.",
            ),
            Task(
                title="Add an end-to-end retry test",
                detail="Verify loading state cleanup and a recoverable error path.",
            ),
        ],
        limitations=[
            "This illustrative report is precomputed; a real root-cause investigation also needs network and backend logs."
        ],
        confidence="high",
    )


def _fmt_ts(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    return f"{total // 60:02d}:{total % 60:02d}"
