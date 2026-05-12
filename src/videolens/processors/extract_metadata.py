from __future__ import annotations

import json
import subprocess
from pathlib import Path

from videolens.types import Metadata


class ProbeError(RuntimeError):
    pass


def probe_metadata(video_path: Path) -> Metadata:
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(video_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise ProbeError(f"ffprobe failed: {result.stderr.strip()}")

    data = json.loads(result.stdout)
    fmt = data.get("format", {})
    streams = data.get("streams", [])
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

    duration = fmt.get("duration")
    width = video_stream.get("width") if video_stream else None
    height = video_stream.get("height") if video_stream else None
    fps = _parse_fps(video_stream.get("avg_frame_rate")) if video_stream else None
    codec = video_stream.get("codec_name") if video_stream else None
    container = fmt.get("format_name")

    return Metadata(
        duration_seconds=float(duration) if duration else None,
        width=width,
        height=height,
        fps=fps,
        has_audio=audio_stream is not None,
        codec=codec,
        container=container,
    )


def _parse_fps(rate: str | None) -> float | None:
    if not rate or rate == "0/0":
        return None
    if "/" in rate:
        num, den = rate.split("/", 1)
        try:
            n, d = float(num), float(den)
            return n / d if d else None
        except ValueError:
            return None
    try:
        return float(rate)
    except ValueError:
        return None
