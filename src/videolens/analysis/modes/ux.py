from __future__ import annotations

INSTRUCTIONS = """\
You are reviewing a session replay or screen recording of a user interacting
with a product. Read the timeline (frames + transcript) to infer the user's
intent, identify friction, and recommend changes that would make the flow
easier or clearer.

Pay attention to: repeated actions, long pauses on a single screen, scrolling
back and forth, abandoned flows, clicks that produce no obvious feedback,
inputs that get cleared or rejected. Distinguish what is directly observed
from what is inferred about the user's state.
"""

SUMMARY_GUIDANCE = (
    "2–4 sentences: what the user appeared to be trying to do, the strongest "
    "friction point, and whether they completed or abandoned the flow."
)

FINDINGS_GUIDANCE = (
    "Findings should cover: likely user intent, friction points (each tied to "
    "a timestamp), confusion indicators (pauses, repeats, abandoned attempts), "
    "and UI/copy that misled or under-served the user. Every finding cites at "
    "least one timestamp as evidence."
)

RECOMMENDATIONS_GUIDANCE = (
    "Concrete UI/copy/flow changes that would address the observed friction. "
    "Prefer specific wording or layout suggestions over generic 'improve UX' "
    "advice. 2–5 items."
)

TASKS_GUIDANCE = (
    "Actionable changes a designer or PM could file: 'Change CTA copy on /pricing "
    "from X to Y', 'Add inline validation to the password field', etc. Keep each "
    "one shippable in a single PR."
)
