import json
from pathlib import Path
from types import SimpleNamespace

from videolens.analysis.analyze_timeline import analyze_timeline
from videolens.analysis.ask_question import ask_question
from videolens.config import Models
from videolens.processors.describe_frames import _describe_one
from videolens.processors.extract_frames import (
    FRAME_PROCESSING_VERSION,
    extract_frames,
)
from videolens.types import (
    AccessLevel,
    AnalysisMode,
    ArtifactsAvailable,
    Frame,
    ResolvedSource,
    SourceType,
    Timeline,
)


class CapturingCompletions:
    def __init__(self, content: str) -> None:
        self.content = content
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        message = SimpleNamespace(content=self.content)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def _client(content: str) -> tuple[SimpleNamespace, CapturingCompletions]:
    completions = CapturingCompletions(content)
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return client, completions


def _source() -> ResolvedSource:
    return ResolvedSource(
        source_url="video.mp4",
        source_type=SourceType.LOCAL_FILE,
        access_level=AccessLevel.FULL_VIDEO,
        artifacts_available=ArtifactsAvailable(video=True),
    )


def test_default_models_use_terra_for_both_quality_roles() -> None:
    models = Models()

    assert models.frame_describe == "gpt-5.6-terra"
    assert models.synthesize == "gpt-5.6-terra"
    assert models.frame_reasoning_effort == "none"
    assert models.synthesize_reasoning_effort == "medium"
    assert models.frame_image_detail == "original"


def test_frame_description_uses_terra_original_detail_without_reasoning(tmp_path: Path) -> None:
    frame_path = tmp_path / "frame.jpg"
    frame_path.write_bytes(b"jpeg")
    payload = json.dumps(
        {
            "visual_summary": "A dashboard is visible.",
            "detected_context": ["browser"],
            "extracted_text": ["VideoLens"],
            "confidence": "high",
        }
    )
    client, completions = _client(payload)

    result = _describe_one(Frame(timestamp=2.0, path=frame_path), client, Models())

    call = completions.calls[0]
    image = call["messages"][1]["content"][1]["image_url"]
    assert result.extracted_text == ["VideoLens"]
    assert call["model"] == "gpt-5.6-terra"
    assert call["reasoning_effort"] == "none"
    assert image["detail"] == "original"


def test_synthesis_and_follow_up_use_terra_with_medium_reasoning() -> None:
    analysis_payload = json.dumps(
        {
            "summary": "Summary",
            "findings": [],
            "recommendations": [],
            "tasks": [],
            "limitations": [],
            "confidence": "high",
        }
    )
    analysis_client, analysis_completions = _client(analysis_payload)

    analyze_timeline(
        Timeline(),
        _source(),
        AnalysisMode.GENERAL,
        "Summarize",
        analysis_client,
        Models(),
    )

    answer_client, answer_completions = _client("Nothing else was visible.")
    answer = ask_question("Anything else?", Timeline(), None, answer_client, Models())

    for call in (analysis_completions.calls[0], answer_completions.calls[0]):
        assert call["model"] == "gpt-5.6-terra"
        assert call["reasoning_effort"] == "medium"
        assert "temperature" not in call
    assert answer == "Nothing else was visible."


def test_frame_extraction_bounds_images_for_original_detail(monkeypatch, tmp_path: Path) -> None:
    captured: dict = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        captured["kwargs"] = kwargs
        return SimpleNamespace(returncode=0, stderr="")

    monkeypatch.setattr("videolens.processors.extract_frames.subprocess.run", fake_run)

    frames = extract_frames(tmp_path / "video.mp4", tmp_path / "frames", 10.0)

    filter_arg = captured["cmd"][captured["cmd"].index("-vf") + 1]
    assert frames == []
    assert "scale=w='min(1920,iw)':h='min(1080,ih)'" in filter_arg
    assert "force_original_aspect_ratio=decrease" in filter_arg
    assert FRAME_PROCESSING_VERSION == "bounded-1920x1080-v1"
