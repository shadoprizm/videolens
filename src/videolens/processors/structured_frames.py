"""Bounded, timestamp-accurate sampling for evidence extraction workflows."""

import math
import re
import subprocess
from pathlib import Path

from videolens.types import Frame, Transcript

CUES = re.compile(
    r"\b(click|select|choose|type|enter|paste|set|setting|command|formula|save|toggle|enable|disable|open|install)\b|点击|选择|输入|粘贴|設定|设置|seleccion|pega|clic|introdu|alege|चुन|क्लिक|दर्ज",
    re.I,
)


def sample_times(duration: float, transcript: Transcript | None = None) -> list[float]:
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("A structured report needs a video with a readable duration.")
    count = min(120, max(1, math.ceil(duration / 0.5)))
    cues = [
        s
        for s in (transcript.segments if transcript else [])
        if math.isfinite(s.start)
        and math.isfinite(s.end)
        and 0 <= s.start < duration
        and s.end >= s.start
        and CUES.search(s.text)
    ]
    base_count = math.ceil(count / 2) if cues else count
    times = {round(i * duration / base_count, 3) for i in range(base_count)}
    candidates = [t for s in cues for t in (s.start, (s.start + s.end) / 2, s.end - 0.25)]
    remaining = count - len(times)
    for i in range(remaining):
        if candidates:
            t = candidates[math.floor(i * len(candidates) / remaining)]
            times.add(round(max(0, min(t, duration - 0.05)), 3))
    for i in range(count):
        if len(times) >= count:
            break
        times.add(round(min((i + 0.5) * duration / count, max(0, duration - 0.05)), 3))
    return sorted(t for t in times if t < duration)[:count]


def extract_structured_frames(
    video_path: Path, cache, duration: float, transcript=None, force=False
):
    times = sample_times(duration, transcript)
    cached = cache.read_json("structured-frames.json") if not force else None
    if cached:
        frames = [Frame.model_validate(f) for f in cached]
        if [f.timestamp for f in frames] == times and all(f.path.exists() for f in frames):
            return frames
    frames = []
    for index, timestamp in enumerate(times):
        path = cache.path(f"frames/evidence_{index:04}.jpg")
        result = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-ss",
                str(timestamp),
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-vf",
                "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
                "-q:v",
                "3",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode or not path.exists():
            raise RuntimeError(f"Could not sample video at {timestamp:.2f}s.")
        frames.append(Frame(timestamp=timestamp, path=path))
    cache.write_json("structured-frames.json", [f.model_dump(mode="json") for f in frames])
    return frames
