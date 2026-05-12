from __future__ import annotations

INSTRUCTIONS = """\
You are reviewing a video by reading a structured timeline (frames + transcript).
Answer the user's prompt with evidence-grounded analysis. Distinguish what is
directly observed from what is inferred. Be specific, terse, and concrete.

For each finding, cite at least one timeline timestamp as evidence. Confidence
levels:
- high   = directly visible or clearly spoken
- medium = strongly implied by behaviour or context
- low    = possible but not confirmed
"""

SUMMARY_GUIDANCE = (
    "A 2–4 sentence executive summary of what happens in the video."
)

FINDINGS_GUIDANCE = (
    "3–6 notable findings: what is visible, what stands out, what's worth knowing. "
    "Each finding must include at least one evidence entry pointing at a timestamp."
)

RECOMMENDATIONS_GUIDANCE = (
    "If the user's prompt invites recommendations, provide 0–4 concrete suggestions. "
    "Otherwise return an empty list."
)

TASKS_GUIDANCE = (
    "0–4 follow-up tasks an agent could action. Empty list is fine."
)
