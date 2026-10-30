"""Independent acoustic observations; exact coverage comes from decoded PCM."""
from __future__ import annotations

import io
import subprocess
import wave
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
    decoded = directory / "decoded.wav"
    segments = []
    try:
        # Decode once from the beginning. Input-side -ss 0 on the real AV1/Opus
        # WebM discarded 1.08s of leading audio, shifting every acoustic window.
        # Preserve the presentation-time origin and fill timestamp gaps with
        # silence before slicing bounded chunks by exact PCM sample positions.
        subprocess.run([
            "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(video),
            "-t", str(limit), "-vn", "-ac", "1", "-ar", "16000",
            "-af", "aresample=async=1:first_pts=0", "-c:a", "pcm_s16le", str(decoded),
        ], check=True, capture_output=True)
        with wave.open(str(decoded), "rb") as audio:
            rate = audio.getframerate()
            if rate != 16000 or audio.getnchannels() != 1 or audio.getsampwidth() != 2 or not audio.getnframes():
                raise RuntimeError("No valid decoded sound evidence was produced.")
            start_sample = 0
            while True:
                pcm = audio.readframes(60 * rate)
                if not pcm:
                    break
                payload = io.BytesIO()
                with wave.open(payload, "wb") as chunk:
                    chunk.setnchannels(1)
                    chunk.setsampwidth(2)
                    chunk.setframerate(rate)
                    chunk.writeframes(pcm)
                result = client.analyze_sounds(payload.getvalue())
                offset = start_sample / rate
                for w in result["windows"]:
                    segments.append(TimelineSegment(start=offset + w["start"], end=offset + w["end"], scene_type="sound observation", audio_summary=w["description"], confidence=w["confidence"]))
                start_sample += len(pcm) // 2
    finally:
        decoded.unlink(missing_ok=True)
    limitations = ["Non-speech sounds were analyzed independently in short audio windows. Ranges show coverage, not exact event onsets. Audio is downmixed to mono; sound direction is not measured. Descriptions are provisional; sound sources, contact and causation are not established by audio alone." if segments else "The decoded audio contains digital silence; no sound model calls were needed."]
    if duration > limit:
        limitations.append("Non-speech sound coverage is limited to the first 20 minutes; later sounds were not analyzed.")
    return segments, limitations
