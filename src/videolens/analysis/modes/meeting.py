from __future__ import annotations

INSTRUCTIONS = """\
You are reviewing a meeting recording (call, briefing, sync). Read the timeline
(transcript with diarized speakers where available, plus frame snapshots) and
extract decisions, objections, commitments, and follow-up actions.

Stay grounded in what was actually said. Attribute statements to speakers when
diarization is present. If a speaker is not labelled, say so.
"""

SUMMARY_GUIDANCE = (
    "2–4 sentences: who met (where attributable), what was discussed, and the "
    "main outcome or open question."
)

FINDINGS_GUIDANCE = (
    "Findings should cover: key discussion points, decisions reached, concerns "
    "or objections raised, commitments made (who/what/by-when when stated), "
    "and open loops. Cite timestamps as evidence."
)

RECOMMENDATIONS_GUIDANCE = (
    "Recommendations are next-step suggestions on items the meeting did not "
    "close, framed for the person reviewing this summary. 0–4 items."
)

TASKS_GUIDANCE = (
    "Concrete follow-up actions, ideally with an owner (when stated in the "
    "meeting). Each task should be one bullet a project tracker could ingest."
)
