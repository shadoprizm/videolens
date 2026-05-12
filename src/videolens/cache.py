from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel


def compute_cache_key(source: str, settings: dict[str, Any]) -> str:
    if Path(source).exists():
        h = _hash_file(Path(source))
    else:
        h = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]
    settings_blob = json.dumps(settings, sort_keys=True).encode("utf-8")
    settings_hash = hashlib.sha256(settings_blob).hexdigest()[:8]
    return f"{h}-{settings_hash}"


def _hash_file(path: Path, chunk: int = 1 << 20) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            buf = f.read(chunk)
            if not buf:
                break
            sha.update(buf)
    return sha.hexdigest()[:16]


class Cache:
    def __init__(self, root: Path, key: str) -> None:
        self.dir = root / key
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / "frames").mkdir(exist_ok=True)

    def path(self, name: str) -> Path:
        return self.dir / name

    def has(self, name: str) -> bool:
        return self.path(name).exists()

    def read_json(self, name: str) -> Any | None:
        p = self.path(name)
        if not p.exists():
            return None
        return json.loads(p.read_text())

    def write_json(self, name: str, data: Any) -> None:
        p = self.path(name)
        if isinstance(data, BaseModel):
            p.write_text(data.model_dump_json(indent=2))
        else:
            p.write_text(json.dumps(data, indent=2, default=str))

    def read_model[T: BaseModel](self, name: str, model: type[T]) -> T | None:
        raw = self.read_json(name)
        if raw is None:
            return None
        return model.model_validate(raw)
