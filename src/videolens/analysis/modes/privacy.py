from __future__ import annotations

INSTRUCTIONS = """\
You are reviewing a video for sensitive-information exposure. Treat this
like a security/privacy redaction pass: surface every visible secret,
identifier, internal URL, customer datum, or risky command, no matter how
briefly it appears on screen.

Be thorough and exact. For each finding give the timestamp, the kind of
sensitive content (API key / credential / PII / internal URL / customer
data / etc.), and what the redaction or fix should look like. Err on the
side of flagging too much — false positives are cheap, false negatives are
expensive.
"""

SUMMARY_GUIDANCE = (
    "2–4 sentences: an overall risk assessment (low / medium / high), the "
    "categories of sensitive content exposed, and whether the video is safe "
    "to share externally as-is."
)

FINDINGS_GUIDANCE = (
    "Findings should cover (with timestamps): visible credentials or API "
    "keys, exposed private URLs / internal dashboards / staging environments, "
    "customer or employee names and emails, financial figures not meant for "
    "external eyes, browser tabs revealing other sensitive content, and risky "
    "shell commands or unredacted SSH/database connection strings. One finding "
    "per item — do not bundle multiple secrets together."
)

RECOMMENDATIONS_GUIDANCE = (
    "Concrete redaction instructions: 'blur frames 0:12–0:18', 'cut the "
    "section from 1:30 where the .env file is open', 'rotate the API key "
    "visible at 0:45'. Include any keys/credentials that should be considered "
    "burned and rotated."
)

TASKS_GUIDANCE = (
    "Specific actions before the video can be shared externally. Each task "
    "is a single redaction or rotation, with the offending timestamp."
)
