from __future__ import annotations

INSTRUCTIONS = """\
You are reviewing a bug recording. Read the timeline (frames + transcript) and
identify the bug, the steps that reproduced it, and the visible failure mode.

Be precise about timestamps. Cite specific frames where error messages, broken
UI, or unexpected behaviour appear. Distinguish directly-observed facts from
inferences about root cause.
"""

SUMMARY_GUIDANCE = (
    "2–4 sentences: what the user was doing, what went wrong, and the visible "
    "failure mode (error text / crash / wrong output)."
)

FINDINGS_GUIDANCE = (
    "Findings should cover: observed issue, expected vs actual behaviour, "
    "visible error messages, environment hints (browser/OS/app), possible root "
    "cause areas. Cite timestamps as evidence."
)

RECOMMENDATIONS_GUIDANCE = (
    "Provide a clean numbered list of reproduction steps and a severity hint "
    "(blocker / major / minor / cosmetic). These belong in the recommendations field."
)

TASKS_GUIDANCE = (
    "Tasks should read like ticket bullet points: a ticket-ready summary, "
    "investigate root cause in X file/system, write regression test, etc."
)
