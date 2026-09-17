import { lessonHtml, lessonMarkdown, LESSON_CSS } from "./shared/lessonReport.js";
import { lessonCopy } from "./shared/lessonCopy.js";
import { procedureHtml, procedureMarkdown, PROCEDURE_CSS } from "./shared/procedureReport.js";
// Render stored reports without executing or fetching any report-provided content.
import { recipeHtml, recipeMarkdown, RECIPE_CSS } from "./shared/recipeReport.js";
export interface CloudReport {
  id: string;
  title: string;
  source_type: string | null;
  mode: string | null;
  report_data: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const escape = (value: string): string => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const prose = (value: string): string => value.split(/\n\s*\n/).filter(Boolean).map(p => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`).join("");
const modeNames: Record<string, string> = { general: "Detailed report", key_insights: "Key insights", bug: "Bug report", meeting: "Meeting notes", ux: "UX review", tutorial: "Tutorial", interview: "Interview", product_demo: "Product demo", content: "Content review", privacy: "Privacy review" };

export function safeSourceUrl(value: unknown): string | null {
  try {
    const url = new URL(text(value));
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function reportTitle(report: CloudReport): string {
  const source = record(report.report_data?.source);
  const title = text(report.title).trim() || text(source.title).trim() || "Untitled video";
  const url = safeSourceUrl(source.url);
  const isYouTube = report.source_type === "youtube" || source.sourceType === "youtube"
    || (url && /(^|\.)(youtube\.com|youtu\.be)$/.test(new URL(url).hostname));
  // The suffix identifies a legacy browser-tab title. Preserve numbers in actual video headings.
  return isYouTube && /\s[-–—]\sYouTube\s*$/i.test(title)
    ? title.replace(/\s[-–—]\sYouTube\s*$/i, "").replace(/^\(\d[\d,.]*\)\s+/, "").trim() || "Untitled video"
    : title;
}

export function reportMode(report: CloudReport): string {
  const mode = text(report.mode) || text(report.report_data?.mode);
  if (mode === "lesson") return lessonCopy(text(report.report_data?.outputLanguage)).label;
  if (mode === "tutorial" && report.report_data?.procedure) return "Make a Procedure";
  return mode === "recipe" ? "Recipe (preview)" : modeNames[mode] || mode.replace(/_/g, " ") || "Video report";
}

export function reportDate(report: CloudReport): string {
  const date = new Date(report.completed_at || report.created_at);
  return Number.isNaN(date.getTime()) ? "Saved report" : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export function timestamp(value: unknown): string {
  const seconds = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function timestampLink(value: unknown, source: string | null): string {
  const label = timestamp(value);
  if (source) {
    const url = new URL(source);
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname)) {
      url.searchParams.set("t", `${typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0}s`);
      return `<a class="cr-timestamp" href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
    }
  }
  return `<span class="cr-timestamp">${label}</span>`;
}

function confidence(value: unknown): string {
  return ["high", "medium", "low"].includes(text(value)) ? `<span class="cr-confidence">${escape(text(value))} confidence</span>` : "";
}

export function reportBody(report: CloudReport): string {
  const data = record(report.report_data), source = record(data.source), sourceUrl = safeSourceUrl(source.url);
  const sections: string[] = [];
  const section = (title: string, content: string) => { if (content) sections.push(`<section class="cr-section"><h2>${title}</h2>${content}</section>`); };
  section("Executive summary", prose(text(data.summary)) || "<p>No summary was saved for this report.</p>");
  if (data.lesson) sections.push(lessonHtml(data.lesson, text(data.outputLanguage), sourceUrl, typeof source.durationSeconds === "number" ? source.durationSeconds : null));
  if (data.procedure) sections.push(procedureHtml(data.procedure, text(data.outputLanguage), sourceUrl, typeof source.durationSeconds === "number" ? source.durationSeconds : null));
  if (data.recipe) sections.push(recipeHtml(data.recipe, text(data.outputLanguage), sourceUrl, typeof source.durationSeconds === "number" ? source.durationSeconds : null));
  section("Key findings", list(data.findings).map(record).map((finding, i) => `<article class="cr-finding"><div class="cr-number">${String(i + 1).padStart(2, "0")}</div><div><h3>${escape(text(finding.finding))}</h3>${confidence(finding.confidence)}${list(finding.evidence).map(record).map(e => `<div class="cr-evidence">${timestampLink(e.timestamp, sourceUrl)}<div>${prose(text(e.detail))}</div></div>`).join("")}</div></article>`).join(""));
  section("Recommendations", list(data.recommendations).map(record).map(r => `<article class="cr-item"><h3>${escape(text(r.recommendation))}</h3>${confidence(r.confidence)}${prose(text(r.rationale))}</article>`).join(""));
  section("Action items", list(data.tasks).map(record).map(t => `<article class="cr-item"><h3>☐ ${escape(text(t.title))}</h3>${prose(text(t.detail))}</article>`).join(""));
  section("Follow-up questions &amp; answers", list(data.qa).map(record).map(q => `<article class="cr-item"><h3>${escape(text(q.question))}</h3>${prose(text(q.answer))}</article>`).join(""));
  section("Limitations", list(data.limitations).filter(v => typeof v === "string").map(v => prose(text(v))).join(""));
  const timeline = list(record(data.timeline).segments).map(record);
  if (timeline.length) section("Evidence timeline", `<details class="cr-timeline"><summary>${timeline.length} captured segments · transcript and visual evidence</summary>${timeline.map(s => `<article class="cr-item"><h3>${timestampLink(s.start, sourceUrl)} – ${timestamp(s.end)}${text(s.sceneType) ? ` · ${escape(text(s.sceneType))}` : ""}</h3>${text(s.transcript) ? `<h4>Transcript</h4>${prose(text(s.transcript))}` : ""}${text(s.visualSummary) ? `<h4>Visual evidence</h4>${prose(text(s.visualSummary))}` : ""}${list(s.ocr).length ? `<h4>On-screen text</h4>${prose(list(s.ocr).map(text).filter(Boolean).join("\n"))}` : ""}</article>`).join("")}</details>`);
  section("Report brief", prose(text(data.prompt)));
  const language = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(text(data.outputLanguage)) ? text(data.outputLanguage) : "";
  return `${data.lesson ? `<style>${LESSON_CSS}</style>` : ""}${data.procedure ? `<style>${PROCEDURE_CSS}</style>` : ""}${data.recipe ? `<style>${RECIPE_CSS}</style>` : ""}<article class="cloud-report"${language ? ` lang="${escape(language)}"` : ""}>
    <header class="cr-cover"><div class="cr-kicker">VideoLens · ${escape(reportMode(report))}</div><h1>${escape(reportTitle(report))}</h1><div class="cr-meta">${escape(reportDate(report))}${typeof source.durationSeconds === "number" ? ` · ${timestamp(source.durationSeconds)} video` : ""} ${confidence(data.confidence)}</div>${sourceUrl ? `<a class="cr-source" href="${escape(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open original video ↗</a>` : ""}</header>
    <div class="cr-content">${sections.join("")}</div><div class="cr-footer">VideoLens · Saved video report</div></article>`;
}

export function reportHtml(report: CloudReport, css: string): string {
  // Standalone, script-free HTML works offline and is also the print document.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(reportTitle(report))} — VideoLens</title><style>${css}</style></head><body>${reportBody(report).replace('<details class="cr-timeline">', '<details class="cr-timeline" open>')}</body></html>`;
}

export function reportMarkdown(report: CloudReport): string {
  const data = record(report.report_data), source = record(data.source);
  const lines = [`# ${reportTitle(report)}`, "", `${reportMode(report)} · ${reportDate(report)}`, ""];
  const sourceUrl = safeSourceUrl(source.url);
  if (sourceUrl) lines.push(`Source: ${sourceUrl}`, "");
  if (typeof source.durationSeconds === "number") lines.push(`Duration: ${timestamp(source.durationSeconds)}`, "");
  if (text(data.confidence)) lines.push(`Overall confidence: ${text(data.confidence)}`, "");
  const section = (name: string, content: string[]) => { if (content.length) lines.push(`## ${name}`, "", ...content, ""); };
  section("Executive summary", [text(data.summary)]);
  if (data.lesson) lines.push(lessonMarkdown(data.lesson, text(data.outputLanguage), sourceUrl), "");
  if (data.procedure) lines.push(procedureMarkdown(data.procedure, text(data.outputLanguage), sourceUrl), "");
  if (data.recipe) lines.push(recipeMarkdown(data.recipe, text(data.outputLanguage)), "");
  section("Key findings", list(data.findings).map(record).flatMap(f => [`### ${text(f.finding)}`, "", `Confidence: ${text(f.confidence)}`, "", ...list(f.evidence).map(record).map(e => `- [${timestamp(e.timestamp)}] ${text(e.detail)}`), ""]));
  section("Recommendations", list(data.recommendations).map(record).flatMap(r => [`### ${text(r.recommendation)}`, "", `Confidence: ${text(r.confidence)}`, "", text(r.rationale), ""]));
  section("Action items", list(data.tasks).map(record).map(t => `- [ ] ${text(t.title)}${text(t.detail) ? ` — ${text(t.detail)}` : ""}`));
  section("Follow-up questions & answers", list(data.qa).map(record).flatMap(q => [`### ${text(q.question)}`, "", text(q.answer), ""]));
  section("Limitations", list(data.limitations).map(text).filter(Boolean).map(l => `- ${l}`));
  section("Evidence timeline", list(record(data.timeline).segments).map(record).flatMap(s => [`### ${timestamp(s.start)} – ${timestamp(s.end)}${text(s.sceneType) ? ` · ${text(s.sceneType)}` : ""}`, "", text(s.transcript), text(s.visualSummary), ...list(s.ocr).map(text), ""]));
  section("Report brief", [text(data.prompt)]);
  return lines.join("\n");
}

export function reportSearchText(report: CloudReport): string {
  return reportMarkdown(report).toLocaleLowerCase();
}

export function reportFilename(report: CloudReport, extension: string): string {
  const name = reportTitle(report).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  return `${name || "report"}-videolens.${extension}`;
}

export function reportJson(report: CloudReport): string {
  const data = record(report.report_data);
  return JSON.stringify({ ...data, source: { ...record(data.source), title: reportTitle(report) } }, null, 2);
}
