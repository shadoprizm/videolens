from __future__ import annotations

INSTRUCTIONS = """\
You are reviewing a finished video to reverse-engineer how the video itself was
made. Focus on the production method: script structure, shot choices, editing
rhythm, overlays, diagrams, screen recordings, voiceover, audio, pacing, CTA,
and the likely production tools or tool classes.

Do NOT confuse the subject matter with the production method. If the video shows
someone building a game, app, model, or product, remember: analyze the video itself,
not the thing being built. Only mention the thing being built when it explains a
production choice, asset type, or proof shot.

Be evidence-grounded. For likely production tools, use confidence levels and cite
visible evidence such as UI, watermarks, clip types, OCR, shot composition, audio
continuity, or editing artifacts. Avoid pretending certainty where the timeline
only supports a tool category.
"""

SUMMARY_GUIDANCE = (
    "2–4 sentences describing the video format and production method: what kind "
    "of video it is, how it is assembled, and what a creator would need to make "
    "a similar video."
)

FINDINGS_GUIDANCE = (
    "3–8 production findings. Cover the video itself: format, script spine, shot "
    "inventory, editing rhythm, proof/credibility visuals, likely production tools "
    "with visible evidence, asset checklist, and CTA/conversion mechanics. Do not "
    "summarize only the topic being discussed."
)

RECOMMENDATIONS_GUIDANCE = (
    "Provide a reusable production blueprint: how to recreate this style for a "
    "different topic, including what assets to gather, what to record, where to use "
    "diagrams/overlays, how often visuals should change, and what lower-budget tool "
    "substitutions are acceptable."
)

TASKS_GUIDANCE = (
    "Concrete follow-up tasks for making a similar video: shot list, script outline, "
    "asset capture checklist, edit checklist, tool stack selection, automation "
    "template work, or a recreation recipe the user can follow."
)
