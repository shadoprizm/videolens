from io import BytesIO

from pypdf import PdfReader

from videolens.outputs import render_html, render_pdf
from videolens.product import build_demo_analysis


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
