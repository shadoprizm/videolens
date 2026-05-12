from __future__ import annotations

from videolens.analysis.modes import bug, general, meeting
from videolens.types import AnalysisMode


def get_mode_prompts(mode: AnalysisMode) -> dict[str, str]:
    """Return the per-mode prompt fragments used to build the analysis prompt."""
    pkg = {
        AnalysisMode.GENERAL: general,
        AnalysisMode.BUG: bug,
        AnalysisMode.MEETING: meeting,
    }[mode]
    return {
        "instructions": pkg.INSTRUCTIONS,
        "summary": pkg.SUMMARY_GUIDANCE,
        "findings": pkg.FINDINGS_GUIDANCE,
        "recommendations": pkg.RECOMMENDATIONS_GUIDANCE,
        "tasks": pkg.TASKS_GUIDANCE,
    }
