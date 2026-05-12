from __future__ import annotations

import base64
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

from openai import OpenAI
from rich.console import Console

from videolens.config import Models
from videolens.types import Frame, FrameSummary


class FrameDescriptionError(RuntimeError):
    pass


SYSTEM_PROMPT = (
    "You are a video frame analyst. Given a single frame, return a JSON object "
    "describing what is visible. Combine visual interpretation with OCR — read any "
    "text on screen. Be specific, terse, and factual. Avoid speculation; if unsure, "
    "say so via the confidence field."
)

USER_PROMPT = (
    "Describe this frame. Return strict JSON with keys:\n"
    "  visual_summary: 1–2 sentences on what is happening / what is on screen.\n"
    "  detected_context: array of short tags (e.g. 'browser', 'terminal', 'meeting', 'screen recording', 'outdoor', 'slide deck').\n"
    "  extracted_text: array of distinct visible text strings (UI labels, code, commands, error messages, URLs). Empty array if no readable text.\n"
    "  confidence: 'high' | 'medium' | 'low' — how confident you are in the description.\n"
    "Do not include any keys other than these. Do not wrap in markdown."
)


def describe_frames(
    frames: list[Frame],
    client: OpenAI,
    models: Models,
    console: Console | None = None,
    max_workers: int = 5,
) -> list[FrameSummary]:
    """Run combined description + OCR on each frame. Parallelized."""
    if not frames:
        return []

    console = console or Console()
    results: dict[int, FrameSummary] = {}

    def task(idx: int, frame: Frame) -> tuple[int, FrameSummary]:
        return idx, _describe_one(frame, client, models.frame_describe)

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = [pool.submit(task, i, f) for i, f in enumerate(frames)]
        done = 0
        for fut in as_completed(futures):
            try:
                idx, summary = fut.result()
                results[idx] = summary
            except Exception as exc:
                console.print(f"[yellow]frame description error: {exc}[/yellow]")
            done += 1
            if done % 5 == 0 or done == len(frames):
                console.print(f"  described {done}/{len(frames)}")

    ordered = [results[i] for i in sorted(results.keys())]
    return ordered


def _describe_one(frame: Frame, client: OpenAI, model: str) -> FrameSummary:
    image_b64 = base64.b64encode(frame.path.read_bytes()).decode("ascii")
    data_url = f"data:image/jpeg;base64,{image_b64}"

    try:
        response = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": USER_PROMPT},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
        )
    except Exception as exc:
        raise FrameDescriptionError(f"vision call failed at t={frame.timestamp:.2f}s: {exc}") from exc

    content = response.choices[0].message.content or "{}"
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise FrameDescriptionError(f"vision returned non-JSON at t={frame.timestamp:.2f}s: {exc}") from exc

    return FrameSummary(
        timestamp=frame.timestamp,
        visual_summary=str(data.get("visual_summary", "")).strip(),
        detected_context=[str(x) for x in (data.get("detected_context") or [])],
        extracted_text=[str(x) for x in (data.get("extracted_text") or [])],
        confidence=_coerce_confidence(data.get("confidence")),
    )


def _coerce_confidence(value: object) -> str:
    v = str(value or "").strip().lower()
    return v if v in ("high", "medium", "low") else "medium"
