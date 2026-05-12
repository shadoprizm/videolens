from __future__ import annotations

from videolens.types import (
    FrameSummary,
    Timeline,
    TimelineSegment,
    Transcript,
    TranscriptSegment,
)


def build_timeline(
    frame_summaries: list[FrameSummary],
    transcript: Transcript | None,
    duration_seconds: float | None,
) -> Timeline:
    """Merge frame summaries and transcript segments into a unified timeline.

    Each frame defines a segment window [t, next_t). Transcript segments overlapping
    that window are concatenated. If there are no frames, fall back to transcript-only
    segments. If neither exists, return an empty timeline.
    """
    if not frame_summaries and (transcript is None or not transcript.segments):
        return Timeline(segments=[])

    if not frame_summaries:
        assert transcript is not None
        return Timeline(
            segments=[
                TimelineSegment(
                    start=s.start,
                    end=s.end,
                    transcript=_speaker_text(s),
                )
                for s in transcript.segments
            ]
        )

    sorted_frames = sorted(frame_summaries, key=lambda f: f.timestamp)
    end_anchor = duration_seconds if duration_seconds is not None else (
        sorted_frames[-1].timestamp + 1.0
    )

    segments: list[TimelineSegment] = []
    for i, frame in enumerate(sorted_frames):
        start = frame.timestamp
        end = sorted_frames[i + 1].timestamp if i + 1 < len(sorted_frames) else end_anchor
        if end <= start:
            end = start + 0.001

        overlapping_text = (
            _collect_transcript(transcript, start, end) if transcript else None
        )

        segments.append(
            TimelineSegment(
                start=start,
                end=end,
                scene_type=_infer_scene_type(frame.detected_context),
                transcript=overlapping_text,
                ocr=list(frame.extracted_text),
                visual_summary=frame.visual_summary or None,
                detected_actions=[],
                confidence=frame.confidence,
            )
        )

    return Timeline(segments=segments)


def _collect_transcript(
    transcript: Transcript | None, start: float, end: float
) -> str | None:
    if transcript is None:
        return None
    pieces: list[str] = []
    for seg in transcript.segments:
        if seg.end < start or seg.start >= end:
            continue
        pieces.append(_speaker_text(seg))
    text = " ".join(p for p in pieces if p).strip()
    return text or None


def _speaker_text(seg: TranscriptSegment) -> str:
    if seg.speaker:
        return f"{seg.speaker}: {seg.text}".strip()
    return seg.text.strip()


def _infer_scene_type(tags: list[str]) -> str | None:
    if not tags:
        return None
    priority = (
        "terminal",
        "code",
        "browser",
        "web_app",
        "dashboard",
        "slide deck",
        "meeting",
        "video call",
        "screen recording",
    )
    lowered = [t.lower() for t in tags]
    for needle in priority:
        for tag in lowered:
            if needle in tag:
                return tag
    return lowered[0]
