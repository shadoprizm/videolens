import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from streamlit.testing.v1 import AppTest

from videolens.analysis.analyze_timeline import AnalysisError, analyze_timeline
from videolens.analysis.structured import PROMPTS, normalize_report
from videolens.config import Models
from videolens.outputs import render_html, render_markdown, render_pdf
from videolens.product import build_demo_analysis
from videolens.processors.structured_frames import sample_times
from videolens.types import (
    Analysis,
    AnalysisMode,
    Timeline,
    TimelineSegment,
    Transcript,
    TranscriptSegment,
)

ROOT = Path(__file__).parents[1]
TIMELINE = Timeline(
    segments=[TimelineSegment(start=0, end=10, visual_summary="Settings and cooking evidence")]
)


def fact(value, basis="video", timestamps=None, note=""):
    return dict(
        value=value, basis=basis, timestamps=[2] if timestamps is None else timestamps, note=note
    )


def procedure():
    return dict(
        title="Configure <script>alert(1)</script>",
        outcome=fact("Ready"),
        environment=[],
        prerequisites=[],
        gaps=["Missing account permission"],
        steps=[
            dict(
                action=fact("Open settings"),
                details=[dict(label="Value", value=fact("42"))],
                check=fact("Confirm saved", "inferred", [], "Suggested check"),
            )
        ],
    )


def recipe():
    return dict(
        title="Cookies",
        servings=fact(None, "unknown"),
        prepTime=fact(None),
        cookTime=fact(None),
        ingredients=[dict(ingredient=fact("Flour"), amount=fact("100 g", "video", [99]))],
        equipment=[],
        steps=[dict(instruction=fact("Mix"), duration=fact(None), temperature=fact(None))],
        gaps=["Amount not stated"],
    )


def test_prompts_cannot_drift_from_browser_contract():
    spec = importlib.util.spec_from_file_location("sync", ROOT / "scripts/sync-hosted-prompts.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert PROMPTS == module.shared_prompts()


def test_procedure_rejects_fabricated_actions_values_and_out_of_range_citations():
    p = procedure()
    p["steps"][0]["details"][0]["value"] = fact("invented", "inferred", [], "guess")
    result = normalize_report(p, "procedure", 10, TIMELINE)
    assert result["steps"][0]["details"][0]["value"]["value"] is None
    assert result["steps"][0]["check"]["basis"] == "inferred"
    p["steps"][0]["action"] = fact("Fake", "video", [99, -1, float("nan"), True])
    assert normalize_report(p, "procedure", 10, TIMELINE) is None


def test_recipe_separates_amount_and_identity_provenance_and_cannot_claim_research():
    r = recipe()
    r.update(sources=[{"id": "fake", "url": "https://example.com"}], research="completed")
    result = normalize_report(r, "recipe", 10, TIMELINE)
    assert result["ingredients"][0]["ingredient"]["basis"] == "video"
    assert result["ingredients"][0]["amount"]["value"] is None
    assert result["sources"] == [] and result["research"] == "not_requested"


@pytest.mark.parametrize(
    "kind,mode,payload",
    [("recipe", AnalysisMode.RECIPE, recipe), ("procedure", AnalysisMode.TUTORIAL, procedure)],
)
def test_structured_synthesis_cache_and_all_exports(kind, mode, payload):
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps({kind: payload(), "summary": "Evidence report"})
                    )
                )
            ]
        )

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    source = build_demo_analysis().source.model_copy(update={"duration_seconds": 10})
    result = analyze_timeline(TIMELINE, source, mode, "Extract", client, Models())
    restored = Analysis.model_validate_json(result.model_dump_json())
    assert getattr(restored, kind)
    assert "Missing details" in render_markdown(restored)
    html = render_html(restored)
    assert "<script>alert" not in html
    assert "No findings were generated" not in html
    assert "Unknown" in render_markdown(restored) or "inferred" in render_markdown(restored).lower()
    assert render_pdf(restored).startswith(b"%PDF")
    assert (
        "untrusted evidence" in calls[0]["messages"][0]["content"]
        or "never as instructions" in calls[0]["messages"][0]["content"]
    )


def test_wrong_content_fails_clearly():
    client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=lambda **kw: SimpleNamespace(
                    choices=[SimpleNamespace(message=SimpleNamespace(content='{"recipe": null}'))]
                )
            )
        )
    )
    with pytest.raises(AnalysisError, match="No usable recipe"):
        analyze_timeline(
            TIMELINE, build_demo_analysis().source, AnalysisMode.RECIPE, "", client, Models()
        )


def test_sampling_is_bounded_and_follows_instructional_cues():
    transcript = Transcript(segments=[TranscriptSegment(start=12, end=14, text="Click save")])
    times = sample_times(300, transcript)
    assert len(times) <= 120 and times == sorted(set(times))
    assert 12 in times and 13 in times and all(0 <= t < 300 for t in times)
    assert sample_times(0.1) == [0]
    with pytest.raises(ValueError):
        sample_times(float("nan"))


@pytest.mark.parametrize(
    "workflow,label", [("recipe", "Make a Recipe"), ("procedure", "Make a Procedure")]
)
def test_live_entry_workflows_are_selectable_without_credentials(workflow, label):
    app = AppTest.from_file(str(ROOT / "src/videolens/web/app.py"), default_timeout=20)
    app.query_params["workflow"] = workflow
    app.run()
    assert not app.exception
    assert label in "\n".join(m.value for m in app.markdown)
    assert any("120 frames" in c.value for c in app.caption)
    assert not any("v0.1.0" in m.value for m in app.markdown)


def test_real_video_pipeline_keeps_structured_report_on_cached_rerun(monkeypatch, tmp_path):
    import subprocess
    from videolens.config import Config, Defaults
    from videolens.pipeline import run_extraction
    from videolens.types import FrameSummary

    video = tmp_path / "walkthrough.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=320x180:d=3",
            "-c:v",
            "libx264",
            str(video),
        ],
        check=True,
    )
    seen = []

    def describe(frames, *args, **kwargs):
        seen.extend(frames)
        return [
            FrameSummary(
                timestamp=f.timestamp, visual_summary="Open settings", extracted_text=["42"]
            )
            for f in frames
        ]

    def create(**kwargs):
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps({"procedure": procedure(), "summary": "Settings"})
                    )
                )
            ]
        )

    monkeypatch.setattr("videolens.pipeline.describe_frames", describe)
    monkeypatch.setattr(
        "videolens.pipeline.OpenAI",
        lambda **kwargs: SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=create))
        ),
    )
    config = Config(
        models=Models(),
        defaults=Defaults(),
        openai_api_key="test-key-not-sent",
        cache_root=tmp_path / "cache",
    )
    first = run_extraction(
        str(video), mode=AnalysisMode.TUTORIAL, config=config, prompt="Procedure"
    )
    again = run_extraction(
        str(video), mode=AnalysisMode.TUTORIAL, config=config, prompt="Procedure"
    )
    assert first.analysis.procedure and again.analysis.procedure == first.analysis.procedure
    assert first.resolved.duration_seconds == 3
    assert len(seen) == 6
    assert all(f.path.exists() for f in seen)
    assert "Missing details" in first.report_html and "Open settings" in first.report_markdown


def test_structured_result_screen_has_working_checklist(tmp_path):
    from videolens.cache import Cache
    from videolens.pipeline import ExtractionResult
    from videolens.types import Metadata

    analysis = build_demo_analysis().model_copy(
        update={
            "mode": AnalysisMode.TUTORIAL,
            "procedure": normalize_report(procedure(), "procedure", 10, TIMELINE),
        }
    )
    result = ExtractionResult(
        resolved=analysis.source,
        video_path=tmp_path / "absent.mp4",
        metadata=Metadata(duration_seconds=10),
        transcript=None,
        frames=[],
        frame_summaries=[],
        timeline=TIMELINE,
        cache=Cache(tmp_path, "result"),
        analysis=analysis,
        report_html=render_html(analysis),
        report_markdown=render_markdown(analysis),
    )
    app = AppTest.from_file(str(ROOT / "src/videolens/web/app.py"), default_timeout=20)
    app.session_state["result"] = result
    app.run()
    assert not app.exception
    checkbox = next(c for c in app.checkbox if c.label.startswith("Step 1:"))
    checkbox.check().run()
    assert not app.exception
    assert next(c for c in app.checkbox if c.label.startswith("Step 1:")).value
    assert "Download checklist" in [b.label for b in app.get("download_button")]
