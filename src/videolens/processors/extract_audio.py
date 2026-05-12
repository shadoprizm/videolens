from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path


class AudioExtractionError(RuntimeError):
    pass


@dataclass
class AudioChunk:
    path: Path
    start: float
    end: float


def extract_audio(video_path: Path, dest: Path) -> Path:
    """Extract a mono 16kHz MP3 suitable for OpenAI transcription. Returns dest."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(video_path),
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-b:a", "64k",
        str(dest),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise AudioExtractionError(f"ffmpeg audio extraction failed: {result.stderr.strip()[-400:]}")
    if not dest.exists():
        raise AudioExtractionError(f"ffmpeg produced no audio at {dest}.")
    return dest


def chunk_audio(
    audio_path: Path,
    dest_dir: Path,
    chunk_seconds: float = 30.0,
    total_duration: float | None = None,
) -> list[AudioChunk]:
    """Split audio into fixed-duration MP3 chunks for transcription.

    Returns chunks ordered by start time. The last chunk's `end` is clamped to
    `total_duration` if provided, otherwise extrapolated from chunk index.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    for old in dest_dir.glob("chunk_*.mp3"):
        old.unlink()

    out_pattern = str(dest_dir / "chunk_%04d.mp3")
    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(audio_path),
        "-f", "segment",
        "-segment_time", str(chunk_seconds),
        "-c:a", "libmp3lame",
        "-b:a", "64k",
        "-ac", "1",
        "-ar", "16000",
        "-reset_timestamps", "1",
        out_pattern,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise AudioExtractionError(f"ffmpeg audio chunking failed: {result.stderr.strip()[-400:]}")

    chunks: list[AudioChunk] = []
    paths = sorted(dest_dir.glob("chunk_*.mp3"))
    if not paths:
        raise AudioExtractionError("ffmpeg produced no audio chunks.")

    for i, p in enumerate(paths):
        start = i * chunk_seconds
        end = (i + 1) * chunk_seconds
        if i == len(paths) - 1 and total_duration is not None:
            end = max(start + 0.1, total_duration)
        chunks.append(AudioChunk(path=p, start=start, end=end))
    return chunks
