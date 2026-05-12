from __future__ import annotations

import os
import sys
from pathlib import Path

from videolens.outputs.write_markdown import render_markdown
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
    """Render the analysis as a styled PDF."""
    import markdown as md
    from weasyprint import HTML

    md_text = render_markdown(analysis)
    html_body = md.markdown(
        md_text,
        extensions=["tables", "fenced_code", "sane_lists"],
    )
    html_doc = _wrap_html(html_body, analysis)
    return HTML(string=html_doc).write_pdf()


def write_pdf(analysis: Analysis, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(render_pdf(analysis))
    return dest


def _wrap_html(body: str, analysis: Analysis) -> str:
    title = f"VideoLens — {analysis.mode.value} report"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{title}</title>
  <style>
    @page {{
      size: Letter;
      margin: 22mm 18mm 22mm 18mm;
      @bottom-right {{
        content: "Page " counter(page) " of " counter(pages);
        font-family: -apple-system, Helvetica, sans-serif;
        font-size: 9pt;
        color: #94A3B8;
      }}
      @bottom-left {{
        content: "VideoLens";
        font-family: -apple-system, Helvetica, sans-serif;
        font-size: 9pt;
        font-weight: 700;
        color: #0891B2;
        letter-spacing: 0.5px;
      }}
    }}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #0F172A;
      font-size: 10.5pt;
      line-height: 1.55;
    }}
    h1 {{
      font-size: 22pt;
      letter-spacing: -0.5px;
      color: #0F172A;
      margin: 0 0 6pt 0;
      padding-bottom: 8pt;
      border-bottom: 2pt solid #0891B2;
    }}
    h2 {{
      font-size: 14pt;
      color: #0F172A;
      margin: 18pt 0 6pt 0;
      letter-spacing: -0.3px;
    }}
    h3 {{
      font-size: 11.5pt;
      color: #0F172A;
      margin: 12pt 0 4pt 0;
    }}
    p {{ margin: 4pt 0 8pt 0; }}
    ul, ol {{ margin: 4pt 0 8pt 16pt; }}
    li {{ margin: 2pt 0; }}
    em {{ color: #475569; font-style: italic; }}
    strong {{ color: #0F172A; }}
    code {{
      font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
      font-size: 9pt;
      background: #F1F5F9;
      color: #0891B2;
      padding: 1pt 4pt;
      border-radius: 3pt;
    }}
    table {{
      border-collapse: collapse;
      width: 100%;
      margin: 8pt 0 12pt 0;
      font-size: 9pt;
    }}
    th {{
      background: #F8FAFC;
      color: #0F172A;
      text-align: left;
      padding: 5pt 6pt;
      border-bottom: 1.5pt solid #CBD5E1;
      font-weight: 600;
    }}
    td {{
      padding: 5pt 6pt;
      border-bottom: 1pt solid #E2E8F0;
      vertical-align: top;
    }}
    tr:nth-child(even) td {{ background: #F8FAFC; }}
    hr {{
      border: none;
      border-top: 1pt solid #E2E8F0;
      margin: 14pt 0;
    }}
    .header-meta {{
      color: #64748B;
      font-size: 9pt;
      margin-bottom: 14pt;
    }}
  </style>
</head>
<body>
  <div class="header-meta">
    VideoLens · Mode: <strong>{analysis.mode.value}</strong> ·
    Overall confidence: <strong>{analysis.confidence}</strong>
  </div>
  {body}
</body>
</html>"""
