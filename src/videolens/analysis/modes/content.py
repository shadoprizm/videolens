from __future__ import annotations

INSTRUCTIONS = """\
You are reviewing a video for its craft: clarity, pacing, structure,
persuasiveness, and call-to-action effectiveness. Treat the speaker like a
writer being workshopped — friendly but specific.

Examine the hook (first ~10 seconds), the pacing throughout, transitions,
visual/audio alignment (does what's on screen support what's being said?),
the strength of any claims, the evidence offered for them, and the close /
CTA. Cite specific timestamps for each critique so the creator can find them.
"""

SUMMARY_GUIDANCE = (
    "2–4 sentences: what kind of video this is, who the apparent audience "
    "is, and your overall impression of its effectiveness."
)

FINDINGS_GUIDANCE = (
    "Findings should cover: hook quality (does the opening earn attention?), "
    "pacing issues (sections that drag or rush), unclear segments, visual/audio "
    "mismatches, unsupported claims or hand-wavy assertions, missing proof or "
    "examples, and the close/CTA strength. Cite timestamps."
)

RECOMMENDATIONS_GUIDANCE = (
    "Specific edits the creator could make: 'cut from 0:42–1:15, the analogy "
    "doesn't land', 'add a chart at 2:30 to back up the 40% claim', 'rewrite "
    "the CTA to ask for one specific action'. 2–5 items."
)

TASKS_GUIDANCE = (
    "Discrete revisions the creator could action — each one a single change."
)
