from videolens.product import (
    build_demo_analysis,
    preset_for,
    preset_for_mode,
    render_report_markdown,
)
from videolens.telemetry import count_bucket, duration_bucket, latency_bucket, track_product_event
from videolens.types import AnalysisMode


def test_workflow_presets_default_to_detailed_report_and_resolve_modes() -> None:
    assert preset_for(None).short_label == "Detailed report"
    assert preset_for(None).mode == AnalysisMode.GENERAL
    assert preset_for("key_insights").mode == AnalysisMode.GENERAL
    assert preset_for("ux").mode == AnalysisMode.UX
    assert preset_for_mode("privacy").mode == AnalysisMode.PRIVACY
    assert preset_for_mode(AnalysisMode.MEETING).short_label == "Interview / podcast"
    assert preset_for_mode(AnalysisMode.PRODUCTION_RECIPE).short_label == "Production recipe"


def test_demo_analysis_is_a_written_youtube_report() -> None:
    demo = build_demo_analysis()
    report = render_report_markdown(demo)

    assert demo.mode == AnalysisMode.GENERAL
    assert demo.source.platform == "youtube"
    assert len(demo.timeline.segments) == 4
    assert "## Key findings and evidence" in report
    assert "**[00:48]**" in report
    assert "- [ ] **Choose one active question**" in report
    assert "fictional educational YouTube video" in report


def test_telemetry_discards_unapproved_content() -> None:
    payload = track_product_event(
        "analysis_started",
        "session-123",
        mode="general",
        source_kind="url",
        prompt="private prompt",
        api_key="sk-secret",
        source_url="https://private.example/video",
    )

    assert payload["properties"] == {"mode": "general", "source_kind": "url"}
    serialized = str(payload)
    assert "private prompt" not in serialized
    assert "sk-secret" not in serialized
    assert "private.example" not in serialized


def test_metric_buckets_are_stable() -> None:
    assert duration_bucket(None) == "unknown"
    assert duration_bucket(60) == "0-1m"
    assert duration_bucket(301) == "5-15m"
    assert latency_bucket(29_999) == "10-30s"
    assert latency_bucket(600_000) == "10m+"
    assert count_bucket(0) == "0"
    assert count_bucket(5) == "3-5"
    assert count_bucket(9) == "6+"
