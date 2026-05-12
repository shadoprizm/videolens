from __future__ import annotations

from pathlib import Path

from videolens.types import Analysis


def write_json(analysis: Analysis, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(analysis.model_dump_json(indent=2))
    return dest
