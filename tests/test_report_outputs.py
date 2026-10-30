from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

from videolens.outputs import render_html, render_pdf, render_markdown
from videolens.product import build_demo_analysis
from videolens.types import SourceType


def test_standalone_html_report_contains_professional_sections_and_safe_content() -> None:
    analysis = build_demo_analysis()
    analysis.source.title = "Research <Brief>"

    report = render_html(analysis)

    assert report.startswith("<!doctype html>")
    assert "Research &lt;Brief&gt;" in report
    assert "VIDEO INTELLIGENCE REPORT" in report
    assert "EXECUTIVE SUMMARY" in report
    assert "KEY FINDINGS" in report
    assert "PRACTICAL TAKEAWAYS" in report
    assert "SOURCE TIMELINE" in report
    assert "data:text" not in report


def test_pdf_report_is_readable_and_multipage() -> None:
    pdf = render_pdf(build_demo_analysis())
    reader = PdfReader(BytesIO(pdf))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)

    assert len(pdf) > 20_000
    assert len(reader.pages) >= 2
    assert "Why most note-taking systems fail" in text
    assert "EXECUTIVE SUMMARY" in text
    assert "PRACTICAL TAKEAWAYS" in text


def test_exports_show_shared_source_limitations_once() -> None:
    analysis = build_demo_analysis()
    shared = "Acoustic descriptions are provisional."
    distinct = "Direction is not measured."
    analysis.source.limitations = [shared]
    analysis.limitations = [shared, distinct]
    for report in (render_html(analysis), render_markdown(analysis)):
        assert report.count(shared) == 1
        assert report.count(distinct) == 1


def test_local_exports_name_the_original_without_broken_server_links() -> None:
    analysis = build_demo_analysis()
    analysis.source.source_type = SourceType.LOCAL_FILE
    analysis.source.source_url = "/tmp/session/uploads/highway-400-dashcam.webm"
    analysis.source.local_path = Path(analysis.source.source_url)
    analysis.source.title = None
    html = render_html(analysis)
    markdown = render_markdown(analysis)
    assert "Original file: highway-400-dashcam.webm" in html
    assert "Illustrative source" not in html
    assert '<a class="timestamp"' not in html
    for report in (html, markdown):
        assert "highway-400-dashcam.webm" in report
        assert "/tmp/session" not in report
