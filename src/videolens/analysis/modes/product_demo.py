from __future__ import annotations

INSTRUCTIONS = """\
You are reviewing a product demo or marketing video. Build a structured
inventory of what the product does and how it is positioned. Note the
strengths the demo emphasises, the weaknesses or rough edges it accidentally
reveals, and the opportunities a competitor or PM could mine.

Stay grounded in what is shown. If the demo claims something without
showing it (e.g., 'this scales to millions of rows' over a stock animation),
flag that distinction in the findings.
"""

SUMMARY_GUIDANCE = (
    "2–4 sentences: what the product is, who it appears to be for, the "
    "headline value proposition, and the overall production quality of the demo."
)

FINDINGS_GUIDANCE = (
    "Findings should cover: feature inventory (every feature shown on screen, "
    "with timestamp), onboarding and core-loop flow, UI patterns used, "
    "positioning and messaging strengths, weaknesses or rough edges visible, "
    "and competitor implications. Cite timestamps for each observation."
)

RECOMMENDATIONS_GUIDANCE = (
    "Opportunities a PM or competitor could pursue: features to clone, gaps "
    "to exploit, positioning angles to test. Frame each as a concrete next move. "
    "0–5 items."
)

TASKS_GUIDANCE = (
    "Ideas worth a deeper investigation or design spike. Each task is one "
    "trackable item: 'Spec a competitor of feature X', 'Test pricing strategy "
    "Y on landing page', etc."
)
