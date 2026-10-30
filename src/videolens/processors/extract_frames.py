from __future__ import annotations

import math
import subprocess
from pathlib import Path

from videolens.types import Frame


class FrameExtractionError(RuntimeError):
    pass


MAX_FRAME_WIDTH = 1920
MAX_FRAME_HEIGHT = 1080
FRAME_PROCESSING_VERSION = "bounded-seek-short-video-v2"


def extract_frames(
    video_path: Path,
    dest_dir: Path,
    duration_seconds: float | None,
    frame_interval: float = 5.0,
    max_frames: int = 40,
) -> list[Frame]:
    """Sample frames at an adaptive interval that respects max_frames.

    Short clips use the available frame budget across the whole clip. Longer
    videos preserve the requested interval and frame cap. Seek each known
    timestamp explicitly: the fps filter may select a later source frame while
    assigning it time zero. Images remain bounded to 1920x1080.
    """
    if max_frames <= 0:
        raise FrameExtractionError("max_frames must be > 0")
    if not math.isfinite(frame_interval) or frame_interval <= 0:
        raise FrameExtractionError("frame_interval must be finite and > 0")

    dest_dir.mkdir(parents=True, exist_ok=True)
    for old in dest_dir.glob("frame_*.jpg"):
        old.unlink()

    interval = frame_interval
    if duration_seconds and duration_seconds > 0:
        target = duration_seconds / max_frames
        interval = max(interval, target)

    fps_expr = f"1/{interval}"
    scale_expr = (
        f"scale=w='min({MAX_FRAME_WIDTH},iw)':h='min({MAX_FRAME_HEIGHT},ih)'"
        ":force_original_aspect_ratio=decrease:force_divisible_by=2"
    )
    if duration_seconds and math.isfinite(duration_seconds) and duration_seconds > 0:
        if duration_seconds <= 60:
            # Up to four samples/second avoids duplicate near-identical images
            # on tiny clips while using the bounded budget on longer clips.
            count = min(max_frames, max(1, math.ceil(duration_seconds / min(frame_interval, 0.25))))
            interval = duration_seconds / count
        else:
            count = min(max_frames, math.ceil(duration_seconds / interval))
        frames: list[Frame] = []
        for i in range(count):
            timestamp = round(i * interval, 6)
            path = dest_dir / f"frame_{i + 1:04d}.jpg"
            result = subprocess.run(
                ["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(timestamp),
                 "-i", str(video_path), "-frames:v", "1", "-vf", scale_expr,
                 "-q:v", "3", str(path)],
                capture_output=True, text=True, check=False,
            )
            if result.returncode != 0:
                raise FrameExtractionError(
                    f"ffmpeg frame extraction failed: {result.stderr.strip()[-400:]}"
                )
            if path.exists():
                frames.append(Frame(timestamp=timestamp, path=path, reason="interval"))
        return frames

    # A source without a readable duration cannot be spread across its length.
    out_pattern = str(dest_dir / "frame_%04d.jpg")

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vf",
        f"fps={fps_expr},{scale_expr}",
        "-q:v",
        "3",
        "-frames:v",
        str(max_frames),
        out_pattern,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise FrameExtractionError(
            f"ffmpeg frame extraction failed: {result.stderr.strip()[-400:]}"
        )

    frames: list[Frame] = []
    for i, path in enumerate(sorted(dest_dir.glob("frame_*.jpg"))):
        if i >= max_frames:
            path.unlink()
            continue
        timestamp = i * interval
        frames.append(Frame(timestamp=timestamp, path=path, reason="interval"))

    return frames
