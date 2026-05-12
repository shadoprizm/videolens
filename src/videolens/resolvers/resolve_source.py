from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

from videolens.types import AccessLevel, ArtifactsAvailable, ResolvedSource, SourceType

VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"}
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"}


def resolve_source(source: str) -> ResolvedSource:
    """First-pass classifier. Real extraction happens in Phase 1 processors."""
    p = Path(source)
    if p.exists() and p.is_file():
        return ResolvedSource(
            source_url=str(p.resolve()),
            source_type=SourceType.LOCAL_FILE,
            access_level=AccessLevel.FULL_VIDEO,
            artifacts_available=ArtifactsAvailable(
                video=True, audio=True, metadata=True
            ),
            local_path=p.resolve(),
        )

    parsed = urlparse(source)
    if not parsed.scheme:
        return ResolvedSource(
            source_url=source,
            source_type=SourceType.UNKNOWN,
            access_level=AccessLevel.BLOCKED,
            artifacts_available=ArtifactsAvailable(),
            limitations=[f"Source '{source}' is not a file or recognizable URL."],
        )

    host = (parsed.hostname or "").lower()
    if host in YOUTUBE_HOSTS:
        return ResolvedSource(
            source_url=source,
            source_type=SourceType.YOUTUBE,
            access_level=AccessLevel.FULL_VIDEO,
            artifacts_available=ArtifactsAvailable(
                video=True, audio=True, transcript=True, metadata=True
            ),
        )

    if Path(parsed.path).suffix.lower() in VIDEO_EXTENSIONS:
        return ResolvedSource(
            source_url=source,
            source_type=SourceType.DIRECT_URL,
            access_level=AccessLevel.FULL_VIDEO,
            artifacts_available=ArtifactsAvailable(
                video=True, audio=True, metadata=True
            ),
        )

    return ResolvedSource(
        source_url=source,
        source_type=SourceType.WEBPAGE,
        access_level=AccessLevel.BLOCKED,
        artifacts_available=ArtifactsAvailable(),
        limitations=[
            "Webpage resolver not implemented yet — only direct files, direct URLs, and YouTube are supported in MVP."
        ],
    )
