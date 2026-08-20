from types import SimpleNamespace

from videolens.analysis.enhance_prompt import enhance_prompt
from videolens.config import Models
from videolens.types import AnalysisMode


def test_enhance_prompt_omits_optional_sampling_parameters() -> None:
    captured: dict = {}

    class FakeCompletions:
        def create(self, **kwargs):
            captured.update(kwargs)
            message = SimpleNamespace(content="Focus on the main claim and supporting evidence.")
            return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    client = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))

    result = enhance_prompt("Summarize it", AnalysisMode.GENERAL, client, Models())

    assert result == "Focus on the main claim and supporting evidence."
    assert captured["model"] == "gpt-5.6-terra"
    assert captured["reasoning_effort"] == "none"
    assert "temperature" not in captured
