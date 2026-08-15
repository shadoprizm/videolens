from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any


ALLOWED_EVENTS = {
    "app_open",
    "demo_opened",
    "workflow_selected",
    "source_added",
    "analysis_started",
    "analysis_succeeded",
    "analysis_failed",
    "validation_failed",
    "evidence_used",
    "report_exported",
    "followup_started",
    "followup_succeeded",
    "followup_failed",
}

ALLOWED_PROPERTIES = {
    "surface",
    "workflow",
    "mode",
    "source_kind",
    "duration_bucket",
    "latency_bucket",
    "finding_count_bucket",
    "error_code",
    "format",
}


def track_product_event(event: str, session_id: str, **properties: Any) -> dict[str, Any]:
    """Log one privacy-safe product event.

    Values outside the explicit allowlist are discarded so prompts, URLs, filenames,
    API keys, report text, and other user content cannot enter the event stream.
    """
    if event not in ALLOWED_EVENTS:
        raise ValueError(f"Unsupported product event: {event}")

    safe_properties = {
        key: _safe_scalar(value)
        for key, value in properties.items()
        if key in ALLOWED_PROPERTIES and value is not None
    }
    payload = {
        "type": "videolens_product_event",
        "version": 1,
        "event": event,
        "session_id": session_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "properties": safe_properties,
    }
    print(f"VIDEOLENS_PRODUCT_EVENT {json.dumps(payload, sort_keys=True)}", flush=True)
    return payload


def duration_bucket(seconds: float | None) -> str:
    if seconds is None:
        return "unknown"
    if seconds <= 60:
        return "0-1m"
    if seconds <= 300:
        return "1-5m"
    if seconds <= 900:
        return "5-15m"
    if seconds <= 1800:
        return "15-30m"
    return "30m+"


def latency_bucket(milliseconds: float) -> str:
    seconds = milliseconds / 1000
    if seconds < 10:
        return "<10s"
    if seconds < 30:
        return "10-30s"
    if seconds < 60:
        return "30-60s"
    if seconds < 180:
        return "1-3m"
    if seconds < 600:
        return "3-10m"
    return "10m+"


def count_bucket(count: int) -> str:
    if count == 0:
        return "0"
    if count <= 2:
        return "1-2"
    if count <= 5:
        return "3-5"
    return "6+"


def _safe_scalar(value: Any) -> str | int | float | bool:
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)
