from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from openai import OpenAI

from videolens.config import Models
from videolens.processors.extract_audio import AudioChunk
from videolens.types import AnalysisMode, Transcript, TranscriptSegment


class TranscriptionError(RuntimeError):
    pass


def transcribe(
    audio_chunks: list[AudioChunk],
    client: OpenAI,
    models: Models,
    mode: AnalysisMode,
    max_workers: int = 4,
) -> Transcript:
    """Transcribe pre-chunked audio with rough per-chunk timestamps.

    The new gpt-4o-(mini-)transcribe family only supports response_format='json'
    or 'text' (no verbose_json). Per-segment timestamps are therefore reconstructed
    from chunk boundaries, not from the model itself. Diarize variant is used for
    meeting mode.
    """
    if not audio_chunks:
        return Transcript(segments=[])

    model_id = (
        models.transcribe_diarize if mode == AnalysisMode.MEETING else models.transcribe_default
    )

    results: dict[int, TranscriptSegment] = {}

    def task(idx: int, chunk: AudioChunk) -> tuple[int, TranscriptSegment]:
        text, speaker = _transcribe_one(chunk.path, client, model_id)
        return idx, TranscriptSegment(
            start=chunk.start,
            end=chunk.end,
            text=text.strip(),
            speaker=speaker,
        )

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = [pool.submit(task, i, c) for i, c in enumerate(audio_chunks)]
        for fut in as_completed(futures):
            idx, segment = fut.result()
            results[idx] = segment

    ordered = [results[i] for i in sorted(results)]
    return Transcript(segments=[s for s in ordered if s.text])


def _transcribe_one(path: Path, client: OpenAI, model_id: str) -> tuple[str, str | None]:
    try:
        with path.open("rb") as f:
            response = client.audio.transcriptions.create(
                model=model_id,
                file=f,
                response_format="json",
            )
    except Exception as exc:
        raise TranscriptionError(f"OpenAI transcription failed ({model_id}): {exc}") from exc

    text = getattr(response, "text", "") or ""
    speaker = getattr(response, "speaker", None)
    return text, speaker
