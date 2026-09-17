"""Evidence contracts for hosted Recipe and Procedure reports.

Prompts are generated from the browser's shared source. Never trust model-supplied
provenance: validate citations and leave unsupported actions/settings unknown.
"""

from __future__ import annotations

import json
import math
from html import escape
from pathlib import Path

from videolens.types import Timeline

PROMPTS = json.loads(Path(__file__).with_name("evidence_prompts.json").read_text())
CONTRACT_VERSION = "hosted-evidence-1"


def obj(value):
    return value if isinstance(value, dict) else {}


def items(value):
    return value if isinstance(value, list) else []


def text(value, limit=4000):
    return value.strip()[:limit] if isinstance(value, str) else ""


def normalize_report(value, kind: str, duration: float | None, timeline: Timeline):
    report = obj(value)
    if not text(report.get("title")):
        return None

    def fact(value, allow_inference=True):
        f = obj(value)
        timestamps = []
        for t in items(f.get("timestamps")):
            if (
                type(t) in (int, float)
                and math.isfinite(t)
                and t >= 0
                and (duration is None or t <= duration)
                and any(s.start <= t < s.end for s in timeline.segments)
                and t not in timestamps
            ):
                timestamps.append(t)
        timestamps = timestamps[:6]
        val, note = text(f.get("value")), text(f.get("note"))
        basis = f.get("basis")
        if not val or basis == "unknown":
            basis = "unknown"
        elif basis == "video" and timestamps:
            basis = "video"
        elif kind == "procedure":
            basis = "inferred" if basis == "inferred" and allow_inference and note else "unknown"
        else:
            # Hosted extraction has no reference retrieval. Never claim it did.
            basis = (
                "estimate"
                if note and basis in ("video", "creator", "reference", "estimate")
                else "unknown"
            )
        result = {
            "value": val if basis != "unknown" else None,
            "basis": basis,
            "timestamps": timestamps if basis == "video" else [],
            "note": note,
        }
        if kind == "recipe":
            result["sourceIds"] = []
        return result

    result = {
        "title": text(report.get("title"), 300),
        "gaps": [text(v) for v in items(report.get("gaps")) if text(v)][:40],
    }
    if kind == "procedure":
        result.update(
            outcome=fact(report.get("outcome")),
            environment=[fact(v) for v in items(report.get("environment"))[:20]],
            prerequisites=[fact(v) for v in items(report.get("prerequisites"))[:30]],
        )
        result["steps"] = [
            {
                "action": fact(s.get("action"), False),
                "details": [
                    {"label": text(d.get("label"), 200), "value": fact(d.get("value"), False)}
                    for d in map(obj, items(s.get("details"))[:30])
                    if text(d.get("label"))
                ],
                "check": fact(s.get("check")),
            }
            for s in map(obj, items(report.get("steps"))[:100])
        ]
        if not any(s["action"]["value"] for s in result["steps"]):
            return None
    else:
        for key in ("servings", "prepTime", "cookTime"):
            result[key] = fact(report.get(key))
        result["ingredients"] = [
            {"ingredient": fact(i.get("ingredient")), "amount": fact(i.get("amount"))}
            for i in map(obj, items(report.get("ingredients"))[:60])
        ]
        result["ingredients"] = [i for i in result["ingredients"] if i["ingredient"]["value"]]
        result["equipment"] = [fact(v) for v in items(report.get("equipment"))[:30]]
        result["steps"] = [
            {key: fact(s.get(key)) for key in ("instruction", "duration", "temperature")}
            for s in map(obj, items(report.get("steps"))[:60])
        ]
        # Retain unknown steps: omitting one could hide a material cooking gap.
        if not result["ingredients"] or not any(s["instruction"]["value"] for s in result["steps"]):
            return None
        result.update(sources=[], research="not_requested")
    return result


def report_sections(analysis):
    """Semantic rows shared by screen, HTML, PDF, Markdown and checklists."""
    p, r = analysis.procedure, analysis.recipe
    if p:
        yield p["title"], [("Outcome", p["outcome"])]
        yield "Environment", [("", f) for f in p["environment"]]
        yield "Prerequisites", [("", f) for f in p["prerequisites"]]
        for i, step in enumerate(p["steps"], 1):
            yield (
                f"Step {i}",
                [
                    ("Action", step["action"]),
                    *[(d["label"], d["value"]) for d in step["details"]],
                    ("Success check", step["check"]),
                ],
            )
    if r:
        yield (
            r["title"],
            [
                ("Servings", r["servings"]),
                ("Preparation time", r["prepTime"]),
                ("Cooking time", r["cookTime"]),
            ],
        )
        yield "Ingredients", [(i["ingredient"]["value"], i["amount"]) for i in r["ingredients"]]
        # Show ingredient identity provenance independently of its amount.
        yield "Ingredient evidence", [("", i["ingredient"]) for i in r["ingredients"]]
        yield "Equipment", [("", f) for f in r["equipment"]]
        for i, step in enumerate(r["steps"], 1):
            yield (
                f"Step {i}",
                [
                    ("Instruction", step["instruction"]),
                    ("Duration", step["duration"]),
                    ("Temperature", step["temperature"]),
                ],
            )


def fact_text(f):
    label = {
        "video": "Video evidence",
        "unknown": "Unknown",
        "inferred": "Inferred",
        "estimate": "Estimate",
    }.get(f["basis"], "Unknown")
    citations = " ".join(f"[{int(t // 60):02}:{int(t % 60):02}]" for t in f["timestamps"])
    note = f" — {f['note']}" if f["note"] else ""
    return f"{f['value'] or 'Unknown'} ({label}) {citations}{note}".strip()


def structured_markdown(analysis):
    if not (analysis.procedure or analysis.recipe):
        return ""

    # Escaping also prevents model text from manufacturing links/images in Streamlit.
    def md(value):
        result = escape(str(value))
        for char in ("\\", "`", "*", "_", "[", "]", "#", "|"):
            result = result.replace(char, "\\" + char)
        return result

    lines = []
    for heading, rows in report_sections(analysis):
        lines.extend([f"### {md(heading)}", ""])
        lines.extend(
            f"- {md(label) + ': ' if label else ''}{md(fact_text(f))}" for label, f in rows
        )
        lines.append("")
    report = analysis.procedure or analysis.recipe
    lines.extend(["### Missing details", ""])
    lines.extend(f"- {md(gap)}" for gap in report["gaps"])
    if not report["gaps"]:
        lines.append("No additional gaps reported. Check evidence before following the steps.")
    if analysis.recipe:
        lines.extend(["", "Video evidence only; no online recipe research was performed."])
    return "\n".join(lines)


def structured_html(analysis):
    if not (analysis.procedure or analysis.recipe):
        return ""
    from videolens.outputs.write_html import _timestamp_url

    sections = []
    for heading, rows in report_sections(analysis):
        rendered = []
        for label, f in rows:
            citations = []
            for t in f["timestamps"]:
                stamp = f"{int(t // 60):02}:{int(t % 60):02}"
                href = (
                    _timestamp_url(analysis.source.source_url, t)
                    if analysis.source.source_url.startswith(("https://", "http://"))
                    else ""
                )
                citations.append(
                    f'<a href="{escape(href, quote=True)}">{stamp}</a>' if href else stamp
                )
            value = escape(f["value"] or "Unknown")
            note = f"<p>{escape(f['note'])}</p>" if f["note"] else ""
            rendered.append(
                f"<li><strong>{escape(label)}: </strong>{value} "
                f"<small>({escape(f['basis'])})</small> {' '.join(citations)}{note}</li>"
            )
        sections.append(f"<h3>{escape(heading)}</h3><ul>{''.join(rendered)}</ul>")
    report = analysis.procedure or analysis.recipe
    gaps = "".join(f"<li>{escape(g)}</li>" for g in report["gaps"])
    sections.append(f"<h3>Missing details</h3><ul>{gaps}</ul>")
    if analysis.recipe:
        sections.append("<p>Video evidence only; no online recipe research was performed.</p>")
    return '<section class="report-section structured-report">' + "".join(sections) + "</section>"
