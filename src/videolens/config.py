from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


ReasoningEffort = Literal["none", "low", "medium", "high", "xhigh", "max"]
ImageDetail = Literal["low", "high", "original"]


@dataclass(frozen=True)
class Models:
    transcribe_default: str = "gpt-4o-mini-transcribe"
    transcribe_diarize: str = "gpt-4o-transcribe-diarize"
    frame_describe: str = "gpt-5.6-terra"
    synthesize: str = "gpt-5.6-terra"
    frame_reasoning_effort: ReasoningEffort = "none"
    synthesize_reasoning_effort: ReasoningEffort = "medium"
    frame_image_detail: ImageDetail = "original"


@dataclass(frozen=True)
class Defaults:
    max_frames: int = 40
    frame_interval_seconds: float = 5.0
    scene_change_threshold: float = 0.3


@dataclass
class Config:
    models: Models
    defaults: Defaults
    cache_root: Path
    openai_api_key: str | None

    @classmethod
    def load(cls) -> Config:
        cache_root = Path(
            os.environ.get("VIDEOLENS_CACHE_DIR", Path.cwd() / ".videolens" / "cache")
        )
        return cls(
            models=Models(),
            defaults=Defaults(),
            cache_root=cache_root,
            openai_api_key=os.environ.get("OPENAI_API_KEY"),
        )
