from __future__ import annotations

from pathlib import Path
from typing import Any

import yt_dlp

from videolens.types import ResolvedSource, SourceType


class DownloadError(RuntimeError):
    pass


def fetch_to_local(source: ResolvedSource, dest_dir: Path) -> tuple[Path, dict[str, Any]]:
    """Resolve a remote source to a local video file. Local files pass through.

    Returns (local_path, info_dict). info_dict is yt-dlp's metadata blob for remote
    sources, or {} for local files.
    """
    if source.source_type == SourceType.LOCAL_FILE:
        if source.local_path is None or not source.local_path.exists():
            raise DownloadError(f"Local file missing: {source.source_url}")
        return source.local_path, {}

    if source.source_type == SourceType.BROWSER_CAPTURE:
        return _browser_capture(source, dest_dir)

    if source.source_type not in (SourceType.YOUTUBE, SourceType.DIRECT_URL, SourceType.WEBPAGE):
        raise DownloadError(
            f"Cannot download source of type {source.source_type.value}."
        )

    dest_dir.mkdir(parents=True, exist_ok=True)
    outtmpl = str(dest_dir / "video.%(ext)s")

    ydl_opts: dict[str, Any] = {
        "format": "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
        "outtmpl": outtmpl,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en", "en-US", "en-GB"],
        "subtitlesformat": "vtt",
        "merge_output_format": "mp4",
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(source.source_url, download=True)
    except yt_dlp.utils.DownloadError as exc:
        raise DownloadError(f"yt-dlp failed: {exc}") from exc

    if info is None:
        raise DownloadError("yt-dlp returned no info.")

    video_path = _find_video_file(dest_dir)
    if video_path is None:
        raise DownloadError(f"No video file written under {dest_dir}.")

    return video_path, info


def _find_video_file(dest_dir: Path) -> Path | None:
    for ext in ("mp4", "mkv", "webm", "mov", "m4v"):
        candidates = sorted(dest_dir.glob(f"video.{ext}"))
        if candidates:
            return candidates[0]
    return None


def _browser_capture(source: ResolvedSource, dest_dir: Path) -> tuple[Path, dict[str, Any]]:
    """Route BROWSER_CAPTURE sources through Playwright. Duration is read from
    the env var VIDEOLENS_CAPTURE_DURATION (set by the CLI flag), defaulting
    to 60 seconds — enough for short replays without surprising the user with
    a long real-time capture."""
    import os

    from videolens.processors.browser_capture import (
        BrowserCaptureError,
        capture_url,
    )

    duration = float(os.environ.get("VIDEOLENS_CAPTURE_DURATION", "60"))
    try:
        path = capture_url(source.source_url, dest_dir, duration_seconds=duration)
    except BrowserCaptureError as exc:
        raise DownloadError(str(exc)) from exc
    return path, {"platform": source.platform, "captured_duration": duration}
