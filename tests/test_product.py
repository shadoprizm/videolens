from videolens.product import (
    build_demo_analysis,
    preset_for,
    preset_for_mode,
    render_issue_markdown,
)
from videolens.telemetry import count_bucket, duration_bucket, latency_bucket, track_product_event
from videolens.types import AnalysisMode


def test_workflow_presets_default_to_bug_and_resolve_modes() -> None:
    assert preset_for(None).mode == AnalysisMode.BUG
    assert preset_for("ux").mode == AnalysisMode.UX
    assert preset_for_mode("privacy").mode == AnalysisMode.PRIVACY
    assert preset_for_mode(AnalysisMode.MEETING).short_label == "Meeting notes"


def test_demo_analysis_is_issue_ready() -> None:
    demo = build_demo_analysis()
    issue = render_issue_markdown(demo)

    assert demo.mode == AnalysisMode.BUG
    assert len(demo.timeline.segments) == 4
    assert "## Findings and evidence" in issue
    assert "**[00:10]**" in issue
    assert "- [ ] **Reproduce the update-payment-method request**" in issue
    assert "illustrative report is precomputed" in issue


def test_telemetry_discards_unapproved_content() -> None:
    payload = track_product_event(
        "analysis_started",
        "session-123",
        mode="bug",
        source_kind="upload",
        prompt="private prompt",
        api_key="sk-secret",
        source_url="https://private.example/video",
    )

    assert payload["properties"] == {"mode": "bug", "source_kind": "upload"}
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
