from __future__ import annotations

import subprocess
from pathlib import Path

from videolens.types import Frame


class FrameExtractionError(RuntimeError):
    pass


def extract_frames(
    video_path: Path,
    dest_dir: Path,
    duration_seconds: float | None,
    frame_interval: float = 5.0,
    max_frames: int = 40,
) -> list[Frame]:
    """Sample frames at an adaptive interval that respects max_frames.

    Strategy for MVP: pick interval = max(frame_interval, duration / max_frames),
    then sample with `fps=1/interval`. Scene-change priority is a v2 enhancement.
    """
    if max_frames <= 0:
        raise FrameExtractionError("max_frames must be > 0")

    dest_dir.mkdir(parents=True, exist_ok=True)
    for old in dest_dir.glob("frame_*.jpg"):
        old.unlink()

    interval = frame_interval
    if duration_seconds and duration_seconds > 0:
        target = duration_seconds / max_frames
        interval = max(interval, target)

    fps_expr = f"1/{interval}"
    out_pattern = str(dest_dir / "frame_%04d.jpg")

    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(video_path),
        "-vf", f"fps={fps_expr}",
        "-q:v", "3",
        out_pattern,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise FrameExtractionError(f"ffmpeg frame extraction failed: {result.stderr.strip()[-400:]}")

    frames: list[Frame] = []
    for i, path in enumerate(sorted(dest_dir.glob("frame_*.jpg"))):
        if i >= max_frames:
            path.unlink()
            continue
        timestamp = i * interval
        frames.append(Frame(timestamp=timestamp, path=path, reason="interval"))

    return frames
