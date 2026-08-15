from videolens.analysis.modes import get_mode_prompts
from videolens.types import AnalysisMode


def test_production_recipe_mode_is_available_and_prompted_for_video_making():
    assert AnalysisMode.PRODUCTION_RECIPE.value == "production_recipe"

    prompts = get_mode_prompts(AnalysisMode.PRODUCTION_RECIPE)

    combined = "\n".join(prompts.values()).lower()
    assert "video itself" in combined
    assert "not the thing being built" in combined
    assert "shot inventory" in combined
    assert "editing rhythm" in combined
    assert "asset checklist" in combined
    assert "recreation recipe" in combined


def test_production_recipe_prompt_asks_for_likely_tools_with_confidence():
    prompts = get_mode_prompts(AnalysisMode.PRODUCTION_RECIPE)

    combined = "\n".join(prompts.values()).lower()
    assert "likely production tools" in combined
    assert "confidence" in combined
    assert "visible evidence" in combined
