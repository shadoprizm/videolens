from __future__ import annotations

from importlib.util import find_spec
from pathlib import Path
from urllib.parse import urlparse

from videolens.types import AccessLevel, ArtifactsAvailable, ResolvedSource, SourceType


def _playwright_available() -> bool:
    return find_spec("playwright") is not None

VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"}
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"}

# Hosts that yt-dlp is known to handle well. Used purely for nicer UI labels —
# the downloader will still attempt yt-dlp on any HTTP URL.
# Session-replay services store events, not video. yt-dlp can't help — these
# need a dedicated event-JSON parser (roadmap) or a Playwright browser capture.
# Detected so we give a clear error instead of a generic "Unsupported URL".
SESSION_REPLAY_HOSTS: dict[str, str] = {
    "posthog.com": "PostHog",
    "us.posthog.com": "PostHog",
    "eu.posthog.com": "PostHog",
    "app.posthog.com": "PostHog",
    "www.fullstory.com": "FullStory",
    "app.fullstory.com": "FullStory",
    "insights.hotjar.com": "Hotjar",
    "clarity.microsoft.com": "Microsoft Clarity",
    "app.logrocket.com": "LogRocket",
    "openreplay.com": "OpenReplay",
    "app.openreplay.com": "OpenReplay",
}


KNOWN_PLATFORMS: dict[str, str] = {
    "loom.com": "Loom",
    "vimeo.com": "Vimeo",
    "player.vimeo.com": "Vimeo",
    "x.com": "X",
    "twitter.com": "Twitter",
    "mobile.twitter.com": "Twitter",
    "twitch.tv": "Twitch",
    "clips.twitch.tv": "Twitch Clips",
    "tiktok.com": "TikTok",
    "vm.tiktok.com": "TikTok",
    "instagram.com": "Instagram",
    "facebook.com": "Facebook",
    "fb.watch": "Facebook",
    "reddit.com": "Reddit",
    "v.redd.it": "Reddit",
    "dailymotion.com": "Dailymotion",
    "rumble.com": "Rumble",
    "streamable.com": "Streamable",
    "soundcloud.com": "SoundCloud",
    "drive.google.com": "Google Drive",
    "dropbox.com": "Dropbox",
}


def _detect_platform(host: str) -> str | None:
    host = host.lower()
    if host in KNOWN_PLATFORMS:
        return KNOWN_PLATFORMS[host]
    for known_host, label in KNOWN_PLATFORMS.items():
        if host.endswith("." + known_host):
            return label
    return None


def _detect_session_replay(host: str) -> str | None:
    host = host.lower()
    if host in SESSION_REPLAY_HOSTS:
        return SESSION_REPLAY_HOSTS[host]
    for known_host, label in SESSION_REPLAY_HOSTS.items():
        if host.endswith("." + known_host):
            return label
    return None


def resolve_source(source: str) -> ResolvedSource:
    """Classify a source. Any HTTP/HTTPS URL is treated as a yt-dlp candidate —
    yt-dlp supports ~1,500 sites and will raise a clear error if it cannot
    extract the given URL. Local files and direct video URLs are detected
    explicitly so they skip yt-dlp entirely."""
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

    replay_platform = _detect_session_replay(host)
    if replay_platform:
        if _playwright_available():
            return ResolvedSource(
                source_url=source,
                source_type=SourceType.BROWSER_CAPTURE,
                access_level=AccessLevel.FULL_VIDEO,
                artifacts_available=ArtifactsAvailable(
                    video=True, audio=True, metadata=True
                ),
                platform=replay_platform,
                limitations=[
                    f"{replay_platform} replays are event streams, not video. "
                    "Capturing the rendered replay via headless Chromium — recording "
                    "happens in real time, so a 5-minute replay takes 5 minutes."
                ],
            )
        return ResolvedSource(
            source_url=source,
            source_type=SourceType.REPLAY_JSON,
            access_level=AccessLevel.BLOCKED,
            artifacts_available=ArtifactsAvailable(),
            platform=replay_platform,
            limitations=[
                f"{replay_platform} session replays are event streams, not video — "
                "yt-dlp can't help. Install the capture extra (uv sync --extra "
                "capture && playwright install chromium) for browser-based capture, "
                "or screen-record the replay in your browser and upload that file."
            ],
        )

    if host in YOUTUBE_HOSTS:
        return ResolvedSource(
            source_url=source,
            source_type=SourceType.YOUTUBE,
            access_level=AccessLevel.FULL_VIDEO,
            artifacts_available=ArtifactsAvailable(
                video=True, audio=True, transcript=True, metadata=True
            ),
            platform="YouTube",
        )

    if Path(parsed.path).suffix.lower() in VIDEO_EXTENSIONS:
        return ResolvedSource(
            source_url=source,
            source_type=SourceType.DIRECT_URL,
            access_level=AccessLevel.FULL_VIDEO,
            artifacts_available=ArtifactsAvailable(
                video=True, audio=True, metadata=True
            ),
            platform="Direct video URL",
        )

    platform = _detect_platform(host)
    if platform:
        return ResolvedSource(
            source_url=source,
            source_type=SourceType.WEBPAGE,
            access_level=AccessLevel.FULL_VIDEO,
            artifacts_available=ArtifactsAvailable(
                video=True, audio=True, metadata=True
            ),
            platform=platform,
        )

    return ResolvedSource(
        source_url=source,
        source_type=SourceType.WEBPAGE,
        access_level=AccessLevel.FULL_VIDEO,
        artifacts_available=ArtifactsAvailable(
            video=True, audio=True, metadata=True
        ),
        platform=host,
        limitations=[
            f"'{host}' is not a known platform. yt-dlp will attempt extraction; "
            "if it isn't supported, you'll see a clear error from yt-dlp."
        ],
    )
