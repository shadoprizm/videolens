from __future__ import annotations

INSTRUCTIONS = """\
You are reviewing a tutorial or how-to video. Extract the implementation
steps shown, the tools and commands used, and any prerequisites or
assumptions the tutorial makes. Be precise about the order of operations
and the exact commands/UI clicks demonstrated.

Flag anything that looks outdated, risky, or skipped over (e.g., 'they
copied a command but didn't explain the flag', 'they assume X is already
installed'). The output should be useful as an agent-ready checklist a
developer or AI agent could follow without re-watching the video.
"""

SUMMARY_GUIDANCE = (
    "2–4 sentences: what the tutorial teaches, the end-state it produces, "
    "and the rough level of expertise it assumes."
)

FINDINGS_GUIDANCE = (
    "Findings should cover: tools and frameworks used, every command run, "
    "every configuration shown on screen (with full text via OCR where "
    "possible), the order of operations, and any assumed prerequisites the "
    "tutorial does not install or explain. Cite timestamps."
)

RECOMMENDATIONS_GUIDANCE = (
    "Missing context, outdated steps, or risky shortcuts the viewer should "
    "know about before following along. 0–4 items."
)

TASKS_GUIDANCE = (
    "An implementation checklist: numbered, agent-ready, one action per item. "
    "Each task is something you can do without re-watching. Include exact "
    "commands and file paths from the timeline's OCR data."
)
