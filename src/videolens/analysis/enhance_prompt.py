from __future__ import annotations

from openai import OpenAI

from videolens.config import Models
from videolens.types import AnalysisMode


class EnhancePromptError(RuntimeError):
    pass


_MODE_GUIDANCE = {
    AnalysisMode.GENERAL: "broad review — what is happening and what is worth knowing",
    AnalysisMode.BUG: "bug analysis — observed issue, reproduction steps, severity",
    AnalysisMode.MEETING: "meeting review — decisions, objections, commitments, follow-ups",
    AnalysisMode.UX: "UX / session replay — user intent, friction, abandoned flows, UI/copy fixes",
    AnalysisMode.TUTORIAL: "tutorial extraction — tools used, ordered steps, prerequisites, agent-ready checklist",
    AnalysisMode.PRODUCT_DEMO: "product demo — feature inventory, positioning, strengths/weaknesses",
    AnalysisMode.CONTENT: "content critique — hook, pacing, clarity, claims/proof, suggested edits",
    AnalysisMode.PRIVACY: "privacy review — visible secrets, credentials, PII, redaction plan",
}


SYSTEM = (
    "You are an expert at writing prompts for prompt-directed video analysis. "
    "The user is going to analyze a video using VideoLens. Their existing prompt "
    "is below — rewrite it so it produces a sharper, more specific, more "
    "actionable analysis in the chosen mode.\n\n"
    "Rules:\n"
    "- Keep it under 3 sentences.\n"
    "- Preserve the user's intent exactly — do not add new asks the user did not request.\n"
    "- Make it specific to the chosen mode's outputs.\n"
    "- Avoid generic filler like 'please analyze in detail'.\n"
    "- Return ONLY the rewritten prompt. No preamble, no quotes, no labels."
)


def enhance_prompt(
    prompt: str,
    mode: AnalysisMode,
    client: OpenAI,
    models: Models,
) -> str:
    """Return a sharper version of the user's prompt, tuned to the selected mode.

    Uses the cheap describe-frames model since this is a tiny text-only call
    (one user-prompt-sized input, one user-prompt-sized output) and the result
    only seeds the much larger synthesis call.
    """
    prompt = (prompt or "").strip()
    if not prompt:
        raise EnhancePromptError("Empty prompt — nothing to enhance.")

    mode_hint = _MODE_GUIDANCE.get(mode, mode.value)
    user_message = (
        f"Analysis mode: {mode.value} ({mode_hint}).\n\n"
        f"Original prompt:\n{prompt}\n\n"
        f"Rewritten prompt:"
    )

    try:
        response = client.chat.completions.create(
            model=models.frame_describe,
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": user_message},
            ],
            temperature=0.4,
        )
    except Exception as exc:
        raise EnhancePromptError(f"enhance call failed ({models.frame_describe}): {exc}") from exc

    enhanced = (response.choices[0].message.content or "").strip()
    enhanced = enhanced.strip('"').strip("'").strip()
    return enhanced or prompt
