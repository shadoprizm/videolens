"""Independent acoustic observations; exact coverage comes from decoded PCM."""
from __future__ import annotations

import subprocess
from pathlib import Path

from videolens.managed import ManagedClient
from videolens.types import TimelineSegment


def analyze_sounds(video: Path, duration: float | None, directory: Path, client) -> tuple[list[TimelineSegment], list[str]]:
    if not isinstance(client, ManagedClient) or not client.sound_consent:
        return [], ["Non-speech sounds were not analyzed: enable Managed sound processing to include actual acoustic evidence. Speech transcription alone does not analyze sounds."]
    if duration is None or duration <= 0:
        return [], ["Non-speech sounds were not analyzed: no readable audio duration."]
    limit = min(duration, 1200.0)
    directory.mkdir(parents=True, exist_ok=True)
    segments = []
    # Sequential bounded chunks leave the API's parallel window workers in charge.
    for start in range(0, int(limit + 0.999), 60):
        wav = directory / "sound.wav"
        try:
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(start), "-i", str(video), "-t", str(min(60, limit - start)), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav)], check=True, capture_output=True)
            result = client.analyze_sounds(wav.read_bytes())
        finally:
            wav.unlink(missing_ok=True)
        for w in result["windows"]:
            segments.append(TimelineSegment(start=start + w["start"], end=start + w["end"], scene_type="sound observation", audio_summary=w["description"], confidence=w["confidence"]))
    limitations = ["Non-speech sounds were analyzed independently in short audio windows. Ranges show coverage, not exact event onsets. Audio is downmixed to mono; sound direction is not measured. Descriptions are provisional; sound sources, contact and causation are not established by audio alone." if segments else "The decoded audio contains digital silence; no sound model calls were needed."]
    if duration > limit:
        limitations.append("Non-speech sound coverage is limited to the first 20 minutes; later sounds were not analyzed.")
    return segments, limitations
