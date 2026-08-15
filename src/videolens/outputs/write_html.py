from __future__ import annotations

from html import escape
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from videolens.types import Analysis


def render_html(analysis: Analysis) -> str:
    """Render a standalone, print-ready VideoLens report."""
    source = analysis.source
    title = source.title or "Video report"
    source_label = source.author or _source_type_label(source.platform or source.source_type.value)
    duration = _fmt_duration(source.duration_seconds)
    evidence_count = sum(len(finding.evidence) for finding in analysis.findings)
    confidence = analysis.confidence.capitalize()

    finding_cards = (
        "".join(
            _finding_card(index, finding, source.source_url)
            for index, finding in enumerate(analysis.findings, 1)
        )
        or '<div class="empty">No findings were generated.</div>'
    )

    takeaway_cards = (
        "".join(
            f"""
        <article class="takeaway">
          <div class="takeaway-mark">{index:02d}</div>
          <div>
            <h3>{_e(item.recommendation)}</h3>
            {f"<p>{_e(item.rationale)}</p>" if item.rationale else ""}
          </div>
        </article>"""
            for index, item in enumerate(analysis.recommendations, 1)
        )
        or '<div class="empty">No practical takeaways were generated.</div>'
    )

    task_items = (
        "".join(
            f"""
        <li>
          <span class="check"></span>
          <div><strong>{_e(task.title)}</strong>{f"<p>{_e(task.detail)}</p>" if task.detail else ""}</div>
        </li>"""
            for task in analysis.tasks
        )
        or '<li class="empty">No follow-up ideas were generated.</li>'
    )

    timeline_rows = "".join(_timeline_row(segment) for segment in analysis.timeline.segments)
    timeline = (
        f"""
        <table class="timeline-table">
          <thead><tr><th>Time</th><th>Scene</th><th>What the video shows and says</th></tr></thead>
          <tbody>{timeline_rows}</tbody>
        </table>"""
        if timeline_rows
        else '<div class="empty">No timeline was generated.</div>'
    )

    limitations = list(source.limitations) + list(analysis.limitations)
    limitation_items = "".join(f"<li>{_e(item)}</li>" for item in limitations)
    limitations_html = (
        f'<ul class="limitations">{limitation_items}</ul>'
        if limitation_items
        else '<p class="muted">No source limitations were reported.</p>'
    )

    source_link = (
        f'<a class="source-link" href="{_e(source.source_url)}">View original source <span>↗</span></a>'
        if source.source_url.startswith(("http://", "https://"))
        else '<span class="source-link source-link-static">Illustrative source</span>'
    )
    mode_label = _mode_label(analysis.mode.value)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>{_e(title)} | VideoLens report</title>
  <style>{_report_css()}</style>
</head>
<body>
  <main class="report-shell">
    <header class="hero">
      <div class="hero-grid"></div>
      <div class="brand-row">
        <div class="brand"><span class="brand-mark">▶</span><span>VideoLens</span></div>
        <div class="document-type">VIDEO INTELLIGENCE REPORT</div>
      </div>
      <div class="hero-copy">
        <div class="eyebrow">{_e(mode_label)}</div>
        <h1>{_e(title)}</h1>
        <p class="source-line">{_e(source_label)}</p>
      </div>
      <div class="hero-meta">
        <div><span>Duration</span><strong>{duration}</strong></div>
        <div><span>Confidence</span><strong>{confidence}</strong></div>
        <div><span>Key findings</span><strong>{len(analysis.findings)}</strong></div>
        <div><span>Evidence points</span><strong>{evidence_count}</strong></div>
      </div>
    </header>

    <section class="executive-summary report-section">
      <div class="section-kicker">01 / EXECUTIVE SUMMARY</div>
      <h2>The video, in writing</h2>
      <p class="summary-copy">{_e(analysis.summary or "No summary was generated.")}</p>
      {source_link}
    </section>

    <section class="report-section findings-section">
      <div class="section-kicker">02 / KEY FINDINGS</div>
      <div class="section-heading-row">
        <h2>What is worth knowing</h2>
        <p>Each finding is grounded in a specific moment from the source.</p>
      </div>
      <div class="finding-list">{finding_cards}</div>
    </section>

    <section class="report-section tinted-section">
      <div class="section-kicker">03 / PRACTICAL TAKEAWAYS</div>
      <h2>What to carry forward</h2>
      <div class="takeaway-grid">{takeaway_cards}</div>
    </section>

    <section class="report-section">
      <div class="section-kicker">04 / FOLLOW-UP</div>
      <h2>Ideas to explore or apply</h2>
      <ul class="task-list">{task_items}</ul>
    </section>

    <section class="report-section timeline-section">
      <div class="section-kicker">05 / SOURCE TIMELINE</div>
      <div class="section-heading-row">
        <h2>How the video unfolds</h2>
        <p>A compact map of the transcript, visuals, and on-screen text.</p>
      </div>
      {timeline}
    </section>

    <section class="report-section report-notes">
      <div class="section-kicker">06 / REPORT NOTES</div>
      <div class="notes-grid">
        <div>
          <h2>Source</h2>
          <dl>
            <div><dt>Type</dt><dd>{_e(_source_type_label(source.source_type.value))}</dd></div>
            <div><dt>Access</dt><dd>{_e(source.access_level.value.replace("_", " ").title())}</dd></div>
            <div><dt>Report style</dt><dd>{_e(mode_label)}</dd></div>
            <div><dt>Overall confidence</dt><dd>{confidence}</dd></div>
          </dl>
        </div>
        <div>
          <h2>Limitations</h2>
          {limitations_html}
        </div>
      </div>
      <div class="method-note">
        VideoLens combines transcript, sampled visual frames, and on-screen text into a timestamped
        evidence timeline before producing this report. Check cited moments against the source before
        relying on consequential details.
      </div>
    </section>

    <footer class="report-footer">
      <div class="brand"><span class="brand-mark">▶</span><span>VideoLens</span></div>
      <p>Turn video into something worth reading.</p>
      <a href="https://videolens.io">videolens.io</a>
    </footer>
  </main>
</body>
</html>"""


def write_html(analysis: Analysis, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(render_html(analysis), encoding="utf-8")
    return dest


def _finding_card(index, finding, source_url: str) -> str:
    evidence = (
        "".join(
            f"""
        <li>
          <a class="timestamp" href="{_e(_timestamp_url(source_url, item.timestamp))}">{_fmt_ts(item.timestamp)}</a>
          <span>{_e(item.detail)}</span>
        </li>"""
            for item in finding.evidence
        )
        or "<li><span>No timestamped evidence was generated.</span></li>"
    )
    return f"""
      <article class="finding-card">
        <div class="finding-index">{index:02d}</div>
        <div class="finding-content">
          <div class="finding-title-row">
            <h3>{_e(finding.finding)}</h3>
            <span class="confidence confidence-{_e(finding.confidence)}">{_e(finding.confidence)}</span>
          </div>
          <ul class="evidence-list">{evidence}</ul>
        </div>
      </article>"""


def _timeline_row(segment) -> str:
    visual_bits = [segment.visual_summary or ""]
    if segment.ocr:
        visual_bits.append("On screen: " + " / ".join(segment.ocr))
    if segment.transcript:
        visual_bits.append("Spoken: " + segment.transcript)
    detail = " ".join(bit.strip() for bit in visual_bits if bit.strip()) or "No detail available."
    return f"""
      <tr>
        <td><strong>{_fmt_ts(segment.start)}</strong><span>{_fmt_ts(segment.end)}</span></td>
        <td>{_e(segment.scene_type or "Video segment")}</td>
        <td>{_e(detail)}</td>
      </tr>"""


def _timestamp_url(source_url: str, seconds: float) -> str:
    if not source_url.startswith(("http://", "https://")):
        return source_url
    parts = urlsplit(source_url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    if "youtube.com" in parts.netloc or "youtu.be" in parts.netloc:
        query["t"] = f"{max(0, int(seconds))}s"
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _fmt_ts(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}" if hours else f"{minutes:02d}:{secs:02d}"


def _fmt_duration(seconds: float | None) -> str:
    return _fmt_ts(seconds) if seconds is not None else "Unknown"


def _mode_label(value: str) -> str:
    return {
        "general": "Detailed written report",
        "meeting": "Interview, podcast, or meeting brief",
        "tutorial": "Tutorial guide",
        "product_demo": "Product demo report",
        "production_recipe": "Production recipe",
        "bug": "Bug report",
        "ux": "UX review",
        "content": "Content review",
        "privacy": "Privacy review",
    }.get(value, value.replace("_", " ").title())


def _source_type_label(value: str) -> str:
    return {
        "youtube": "YouTube",
        "local_file": "Local file",
        "direct_url": "Direct video URL",
        "browser_capture": "Browser capture",
        "replay_json": "Session replay",
    }.get(value, value.replace("_", " ").title())


def _e(value: object) -> str:
    return escape(str(value), quote=True)


def _report_css() -> str:
    return """
    :root {
      --ink: #0f172a;
      --muted: #64748b;
      --line: #dbe4ef;
      --paper: #ffffff;
      --soft: #f4f8fb;
      --cyan: #0891b2;
      --cyan-dark: #155e75;
      --indigo: #4f46e5;
      --green: #047857;
      --amber: #b45309;
    }
    @page {
      size: Letter;
      margin: 16mm 16mm 18mm;
    }
    * { box-sizing: border-box; }
    html { background: #e8eef5; }
    body {
      margin: 0;
      color: var(--ink);
      background: #e8eef5;
      font-family: Inter, "Helvetica Neue", Arial, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; }
    .report-shell {
      width: min(980px, calc(100% - 32px));
      margin: 32px auto;
      overflow: hidden;
      background: var(--paper);
      border-radius: 18px;
    }
    .hero {
      position: relative;
      overflow: hidden;
      min-height: 390px;
      padding: 48px 56px 42px;
      color: white;
      background: linear-gradient(135deg, #0f172a 0%, #123e59 58%, #164e63 100%);
    }
    .hero::after {
      position: absolute;
      right: -100px;
      bottom: -140px;
      width: 410px;
      height: 410px;
      content: "";
      border: 1px solid rgba(255,255,255,0.13);
      border-radius: 50%;
    }
    .hero-grid {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      opacity: 0.08;
      background-image: linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px);
      background-size: 32px 32px;
    }
    .brand-row, .hero-copy, .hero-meta { position: relative; z-index: 1; }
    .brand-row { display: flex; align-items: center; justify-content: space-between; }
    .brand { display: inline-flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 800; letter-spacing: -0.03em; }
    .brand-mark { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; color: white; background: linear-gradient(135deg, #06b6d4, #6366f1); border-radius: 9px; font-size: 12px; }
    .document-type { color: #a5f3fc; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; }
    .hero-copy { max-width: 720px; margin-top: 70px; }
    .eyebrow, .section-kicker { color: var(--cyan); font-size: 11px; font-weight: 800; letter-spacing: 0.13em; text-transform: uppercase; }
    .hero .eyebrow { color: #67e8f9; }
    h1 { max-width: 760px; margin: 12px 0 12px; font-size: 46px; line-height: 1.05; letter-spacing: -0.045em; }
    .source-line { margin: 0; color: #cbd5e1; font-size: 17px; }
    .hero-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 54px; padding-top: 22px; border-top: 1px solid rgba(255,255,255,.16); }
    .hero-meta div { display: flex; flex-direction: column; gap: 2px; }
    .hero-meta span { color: #94a3b8; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .hero-meta strong { color: #f8fafc; font-size: 16px; }
    .report-section { padding: 58px 56px; border-bottom: 1px solid var(--line); }
    .report-section h2 { margin: 9px 0 22px; font-size: 30px; line-height: 1.16; letter-spacing: -0.035em; }
    .summary-copy { max-width: 790px; margin: 0; color: #1e293b; font-size: 21px; line-height: 1.58; letter-spacing: -0.012em; }
    .source-link { display: inline-flex; gap: 7px; margin-top: 28px; color: var(--cyan-dark); font-size: 13px; font-weight: 700; text-decoration: none; }
    .source-link-static { color: var(--muted); }
    .section-kicker, .section-heading-row, .report-section > h2 { break-after: avoid; }
    .section-heading-row { display: flex; align-items: end; justify-content: space-between; gap: 32px; margin-bottom: 22px; }
    .section-heading-row h2 { margin-bottom: 0; }
    .section-heading-row > p { max-width: 320px; margin: 0; color: var(--muted); font-size: 13px; }
    .finding-list { display: grid; gap: 16px; }
    .finding-card { display: grid; grid-template-columns: 48px 1fr; gap: 18px; padding: 24px; border: 1px solid var(--line); border-radius: 14px; background: white; break-inside: avoid; }
    .finding-index { color: var(--cyan); font-size: 13px; font-weight: 800; letter-spacing: .08em; }
    .finding-title-row { display: flex; align-items: start; justify-content: space-between; gap: 18px; }
    .finding-title-row h3 { margin: 0; font-size: 18px; line-height: 1.35; letter-spacing: -0.015em; }
    .confidence { flex: none; padding: 4px 8px; color: var(--muted); background: #f1f5f9; border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .confidence-high { color: var(--green); background: #ecfdf5; }
    .confidence-medium { color: var(--amber); background: #fffbeb; }
    .evidence-list { display: grid; gap: 10px; margin: 17px 0 0; padding: 0; list-style: none; }
    .evidence-list li { display: grid; grid-template-columns: 58px 1fr; gap: 12px; color: #475569; font-size: 13px; }
    .timestamp { align-self: start; padding: 3px 6px; color: var(--cyan-dark); background: #ecfeff; border-radius: 5px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 10px; font-weight: 800; text-align: center; text-decoration: none; }
    .tinted-section { background: var(--soft); }
    .tinted-section { break-inside: avoid; }
    .takeaway-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .takeaway { display: grid; grid-template-columns: 38px 1fr; gap: 14px; padding: 22px; background: white; border: 1px solid var(--line); border-radius: 13px; break-inside: avoid; }
    .takeaway-mark { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; color: white; background: linear-gradient(135deg, var(--cyan), var(--indigo)); border-radius: 10px; font-size: 10px; font-weight: 800; }
    .takeaway h3 { margin: 0 0 5px; font-size: 15px; line-height: 1.35; }
    .takeaway p { margin: 0; color: var(--muted); font-size: 12px; }
    .task-list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
    .task-list li { display: flex; gap: 14px; padding: 17px 0; border-bottom: 1px solid var(--line); break-inside: avoid; }
    .task-list li:last-child { border-bottom: 0; }
    .check { flex: none; width: 20px; height: 20px; margin-top: 2px; border: 2px solid #94a3b8; border-radius: 6px; }
    .task-list strong { font-size: 14px; }
    .task-list p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
    .timeline-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .timeline-table { break-inside: avoid; }
    .timeline-table th { padding: 10px 12px; color: var(--muted); border-bottom: 2px solid var(--ink); font-size: 9px; letter-spacing: .08em; text-align: left; text-transform: uppercase; }
    .timeline-table td { padding: 15px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .timeline-table tr { break-inside: avoid; }
    .timeline-table td:first-child { width: 78px; color: var(--cyan-dark); font-family: "SFMono-Regular", Consolas, monospace; }
    .timeline-table td:first-child span { display: block; color: #94a3b8; font-size: 9px; }
    .timeline-table td:nth-child(2) { width: 145px; font-weight: 700; }
    .timeline-table td:nth-child(3) { color: #475569; }
    .notes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 52px; }
    .notes-grid h2 { margin-top: 0; font-size: 20px; }
    dl { margin: 0; }
    dl div { display: flex; justify-content: space-between; gap: 18px; padding: 9px 0; border-bottom: 1px solid var(--line); }
    dt { color: var(--muted); font-size: 11px; }
    dd { margin: 0; font-size: 11px; font-weight: 700; text-align: right; }
    .limitations { margin: 0; padding-left: 18px; color: #475569; font-size: 11px; }
    .limitations li { margin-bottom: 7px; }
    .method-note { margin-top: 32px; padding: 18px 20px; color: #475569; background: var(--soft); border-left: 3px solid var(--cyan); border-radius: 0 10px 10px 0; font-size: 11px; }
    .report-footer { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 30px 56px; color: white; background: var(--ink); }
    .report-footer .brand { font-size: 16px; }
    .report-footer .brand-mark { width: 24px; height: 24px; border-radius: 7px; font-size: 9px; }
    .report-footer p { margin: 0; color: #94a3b8; font-size: 12px; }
    .report-footer a { color: #67e8f9; font-size: 12px; font-weight: 700; text-decoration: none; }
    .empty, .muted { color: var(--muted); font-style: italic; }
    @media print {
      html, body { background: white; }
      body { font-size: 10pt; }
      .report-shell { width: 100%; margin: 0; overflow: visible; background: transparent; border-radius: 0; }
      .hero { min-height: 245px; padding: 26px 30px 24px; border-radius: 0; }
      .hero-copy { margin-top: 36px; }
      h1 { font-size: 30pt; }
      .hero-meta { margin-top: 30px; }
      .report-section { padding: 28px 30px; }
      .report-section h2 { font-size: 21pt; }
      .summary-copy { font-size: 14.5pt; }
      .findings-section, .tinted-section, .timeline-section, .report-notes { break-before: page; }
      .tinted-section { break-inside: auto; }
      .report-notes { break-inside: avoid; }
      .finding-card { padding: 16px; }
      .finding-title-row h3 { font-size: 12pt; }
      .tinted-section { background: transparent; }
      .takeaway { padding: 15px; background: var(--soft); }
      .report-footer { padding: 18px 30px; }
      a { text-decoration: none; }
    }
    """
