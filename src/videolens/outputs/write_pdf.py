from __future__ import annotations

import os
import sys
from pathlib import Path

from videolens.outputs.write_html import render_html
from videolens.types import Analysis


def _ensure_brew_libs_on_path() -> None:
    """WeasyPrint loads libgobject/pango/cairo via dlopen, which on macOS does
    not search /opt/homebrew/lib by default. Inject brew's lib path so
    `import weasyprint` succeeds in user environments where the libs are
    installed but not on the default loader search path."""
    if sys.platform != "darwin":
        return
    candidates = ("/opt/homebrew/lib", "/usr/local/lib")
    existing = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
    parts = [p for p in existing.split(":") if p]
    for c in candidates:
        if Path(c).is_dir() and c not in parts:
            parts.append(c)
    os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = ":".join(parts)


_ensure_brew_libs_on_path()


def render_pdf(analysis: Analysis) -> bytes:
    """Render the standalone HTML report as a print-quality PDF."""
    from weasyprint import HTML

    return HTML(string=render_html(analysis)).write_pdf()


def write_pdf(analysis: Analysis, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(render_pdf(analysis))
    return dest
