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


def test_default_models_use_efficient_extraction_and_stronger_direct_review() -> None:
    models = Models()

    assert models.frame_describe == "gpt-6-luna"
    assert models.synthesize == "gpt-6-luna"
    assert models.frame_reasoning_effort == "high"
    assert models.synthesize_reasoning_effort == "high"
    assert models.frame_image_detail == "original"


def test_frame_description_uses_current_extraction_model(tmp_path: Path) -> None:
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
    assert call["model"] == "gpt-6-luna"
    assert call["reasoning_effort"] == "high"
    assert image["detail"] == "original"


def test_synthesis_and_follow_up_use_stronger_review_model() -> None:
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
        assert call["model"] == "gpt-6-luna"
        assert call["reasoning_effort"] == "high"
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
    assert FRAME_PROCESSING_VERSION == "bounded-seek-short-video-v2"


def test_short_video_covers_a_brief_event_at_the_cited_times(tmp_path: Path) -> None:
    """A 400ms event between the old five-second samples must be observable."""
    import subprocess

    video = tmp_path / "brief-event.mp4"
    subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
        "color=c=blue:s=160x90:r=30:d=17.6", "-vf",
        "drawbox=x=0:y=0:w=iw:h=ih:color=red:t=fill:enable='between(t,8.35,8.75)'",
        "-c:v", "libx264", str(video),
    ], check=True, capture_output=True)
    frames = extract_frames(video, tmp_path / "sampled", 17.6, max_frames=40)
    assert len(frames) == 40
    assert frames[0].timestamp == 0
    assert frames[-1].timestamp > 17

    def rgb(frame):
        return subprocess.run([
            "ffmpeg", "-nostdin", "-v", "error", "-i", str(frame.path),
            "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-",
        ], check=True, capture_output=True).stdout

    first = rgb(frames[0])
    event = next(f for f in frames if 8.35 <= f.timestamp <= 8.7)
    visible = rgb(event)
    assert first[2] > first[0] + 150  # blue at time zero, not a later fps-bin frame
    assert visible[0] > visible[2] + 150  # red event agrees with its cited timestamp


def test_long_video_keeps_its_cost_cap_and_requested_spacing(monkeypatch, tmp_path):
    calls = []

    def capture(cmd, **kwargs):
        calls.append(cmd)
        Path(cmd[-1]).write_bytes(b"frame")
        return SimpleNamespace(returncode=0, stderr="")

    monkeypatch.setattr("videolens.processors.extract_frames.subprocess.run", capture)
    frames = extract_frames(tmp_path / "long.mp4", tmp_path / "frames", 600, max_frames=40)
    assert len(frames) == 40
    assert [f.timestamp for f in frames[:3]] == [0, 15, 30]
    assert all(float(cmd[cmd.index("-ss") + 1]) == frame.timestamp for cmd, frame in zip(calls, frames))
