"""Browser-based capture for sources yt-dlp can't handle (PostHog session
replays, Hotjar, Clarity, FullStory, LogRocket, OpenReplay, and any web page
with an embedded HTML5 video player that isn't a known platform).

Opens the URL in headless Chromium via Playwright, attempts a few common
"start playback" interactions, then records the viewport as WebM for a
configurable duration. The recording is fed into the rest of the pipeline
exactly like any other local video file.

The capture is real-time — a 5-minute replay takes 5 minutes to record.
This is the dominant cost of using this fallback. To bound it, pass a
sensible `--capture-duration`.

This module is opt-in: requires the `capture` extra (`uv sync --extra
capture`) and `playwright install chromium` to have been run once on the
machine. Importing this module only depends on stdlib; Playwright is
imported lazily inside `capture_url`.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any


class BrowserCaptureError(RuntimeError):
    pass


# Per-platform CSS selectors we try for "click to play". Best-effort —
# unknown platforms get a generic <video> autoplay attempt.
PLAY_SELECTORS: dict[str, list[str]] = {
    "posthog": [
        "[data-attr='session-recording-play-button']",
        "button[aria-label='Play']",
        ".rrweb-player__controller-play",
    ],
    "hotjar": ["button[aria-label='Play']"],
    "clarity": ["button[aria-label='Play']"],
    "logrocket": ["button[aria-label='Play']"],
    "fullstory": ["button[aria-label='Play']"],
    "openreplay": ["button[aria-label='Play']"],
    "generic": [
        "button[aria-label='Play']",
        "button[title='Play']",
        ".vjs-big-play-button",
    ],
}


def _platform_key(url: str) -> str:
    u = url.lower()
    for key in ("posthog", "hotjar", "clarity", "logrocket", "fullstory", "openreplay"):
        if key in u:
            return key
    return "generic"


def capture_url(
    url: str,
    dest_dir: Path,
    duration_seconds: float = 60.0,
    viewport: tuple[int, int] = (1280, 800),
    headless: bool = True,
) -> Path:
    """Open `url` in Chromium, start playback, and record `duration_seconds` of
    the viewport to WebM. Returns the path to the recorded video file.

    Raises BrowserCaptureError on any failure with enough detail for the user
    to know whether to retry, escape to manual screen-capture, or report a bug.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)

    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except ImportError as exc:
        raise BrowserCaptureError(
            "Browser capture requires the `capture` extra. Install with:\n"
            "  uv sync --extra capture\n"
            "  uv run playwright install chromium"
        ) from exc

    platform = _platform_key(url)
    selectors = PLAY_SELECTORS.get(platform, PLAY_SELECTORS["generic"])

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=headless)
            context = browser.new_context(
                viewport={"width": viewport[0], "height": viewport[1]},
                record_video_dir=str(dest_dir),
                record_video_size={"width": viewport[0], "height": viewport[1]},
            )
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=60_000)

            _try_start_playback(page, selectors)

            page.wait_for_timeout(int(duration_seconds * 1000))

            # Closing the page flushes the recording to disk.
            page.close()
            context.close()
            browser.close()
    except BrowserCaptureError:
        raise
    except Exception as exc:
        raise BrowserCaptureError(
            f"Playwright capture failed for {url}: {exc}. "
            "If this is your first run, you may need: uv run playwright install chromium"
        ) from exc

    return _finalize_recording(dest_dir)


def _try_start_playback(page: Any, selectors: list[str]) -> None:
    """Best-effort click on common play buttons; also tries auto-play any
    <video> element. Silent on failure — many sites auto-play."""
    for sel in selectors:
        try:
            handle = page.wait_for_selector(sel, timeout=3_000, state="visible")
            if handle is not None:
                handle.click()
                page.wait_for_timeout(500)
                return
        except Exception:
            continue

    try:
        page.evaluate(
            """() => {
                const videos = document.querySelectorAll('video');
                for (const v of videos) {
                    try { v.muted = false; v.play(); } catch (e) {}
                }
            }"""
        )
    except Exception:
        pass


def _finalize_recording(dest_dir: Path) -> Path:
    """Playwright writes to a random-named .webm. Rename it to capture.webm
    and clean up any sibling files so the pipeline sees a single source."""
    webms = sorted(dest_dir.glob("*.webm"))
    if not webms:
        raise BrowserCaptureError(
            f"No video file written to {dest_dir}. Playwright may have failed silently."
        )

    primary = max(webms, key=lambda p: p.stat().st_size)
    final = dest_dir / "capture.webm"
    if primary != final:
        if final.exists():
            final.unlink()
        shutil.move(str(primary), str(final))
        for leftover in dest_dir.glob("*.webm"):
            if leftover != final:
                leftover.unlink()
    return final
