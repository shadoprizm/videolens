from pathlib import Path

import pytest

from videolens.processors import download
from videolens.types import AccessLevel, ArtifactsAvailable, ResolvedSource, SourceType


def _youtube_source() -> ResolvedSource:
    return ResolvedSource(
        source_url="https://www.youtube.com/watch?v=jNQXAC9IVRw",
        source_type=SourceType.YOUTUBE,
        access_level=AccessLevel.FULL_VIDEO,
        artifacts_available=ArtifactsAvailable(video=True),
        platform="youtube",
    )


def test_youtube_uses_embedded_client_and_ipv4(monkeypatch, tmp_path: Path) -> None:
    captured: dict = {}

    class FakeYoutubeDL:
        def __init__(self, options):
            captured.update(options)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def extract_info(self, _url, *, download: bool):
            assert download is True
            (tmp_path / "video.mp4").write_bytes(b"video")
            return {"title": "test"}

    monkeypatch.setattr(download.yt_dlp, "YoutubeDL", FakeYoutubeDL)

    path, info = download.fetch_to_local(_youtube_source(), tmp_path)

    assert path == tmp_path / "video.mp4"
    assert info["title"] == "test"
    assert captured["extractor_args"] == {
        "youtube": {"player_client": ["mweb"]},
        "youtubepot-bgutilhttp": {"base_url": ["http://127.0.0.1:4416"]},
    }
    assert captured["force_ipv4"] is True
    assert captured["noplaylist"] is True


@pytest.mark.parametrize(
    "message",
    [
        "HTTP Error 403: Forbidden",
        "No video formats found!",
        "Sign in to confirm you’re not a bot",
    ],
)
def test_youtube_access_failure_has_actionable_message(
    monkeypatch, tmp_path: Path, message: str
) -> None:
    class FailingYoutubeDL:
        def __init__(self, _options):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def extract_info(self, _url, **kwargs):
            assert kwargs["download"] is True
            raise download.yt_dlp.utils.DownloadError(message)

    monkeypatch.setattr(download.yt_dlp, "YoutubeDL", FailingYoutubeDL)

    with pytest.raises(download.DownloadError, match="Upload a video file"):
        download.fetch_to_local(_youtube_source(), tmp_path)
