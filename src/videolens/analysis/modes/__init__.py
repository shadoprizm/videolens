from __future__ import annotations

from videolens.analysis.modes import (
    bug,
    content,
    general,
    meeting,
    privacy,
    product_demo,
    tutorial,
    ux,
)
from videolens.types import AnalysisMode


_MODE_MODULES = {
    AnalysisMode.GENERAL: general,
    AnalysisMode.BUG: bug,
    AnalysisMode.MEETING: meeting,
    AnalysisMode.UX: ux,
    AnalysisMode.TUTORIAL: tutorial,
    AnalysisMode.PRODUCT_DEMO: product_demo,
    AnalysisMode.CONTENT: content,
    AnalysisMode.PRIVACY: privacy,
}


def get_mode_prompts(mode: AnalysisMode) -> dict[str, str]:
    """Return the per-mode prompt fragments used to build the analysis prompt."""
    pkg = _MODE_MODULES[mode]
    return {
        "instructions": pkg.INSTRUCTIONS,
        "summary": pkg.SUMMARY_GUIDANCE,
        "findings": pkg.FINDINGS_GUIDANCE,
        "recommendations": pkg.RECOMMENDATIONS_GUIDANCE,
        "tasks": pkg.TASKS_GUIDANCE,
    }
