// Port of src/videolens/analysis/analyze_timeline.py and ask_question.py
import { MODELS } from "./config";
import { MODE_PROMPTS } from "./modes";
import { chatCompletion } from "./openai";
import { coerceConfidence } from "./describeFrames";
import type {
  Analysis,
  AnalysisMode,
  AnalysisTask,
  Finding,
  Recommendation,
  SourceInfo,
  Timeline,
} from "./types";

const SYSTEM_PROMPT_TEMPLATE = `You are VideoLens, an analyst that reviews videos by reading a structured
timeline. The user provides a prompt and an analysis mode. You return a single
JSON object matching the schema below. Be faithful to evidence: every finding
should cite at least one timestamp from the timeline.

Mode-specific guidance:
{mode_instructions}

Return strict JSON with these keys (and no others):
  summary: string — {summary_guidance}
  findings: array of objects:
    - finding: string
    - evidence: array of objects with keys 'timestamp' (number, seconds) and 'detail' (string)
    - confidence: 'high' | 'medium' | 'low'
  recommendations: array of objects:
    - recommendation: string
    - rationale: string | null
    - confidence: 'high' | 'medium' | 'low'
    Guidance: {recommendations_guidance}
  tasks: array of objects:
    - title: string
    - detail: string | null
    Guidance: {tasks_guidance}
  limitations: array of strings — what you could NOT determine from the timeline.
  confidence: 'high' | 'medium' | 'low' — overall confidence in your analysis.

Do not wrap in markdown. Do not include any keys besides those listed.`;

export async function analyzeTimeline(
  apiKey: string,
  timeline: Timeline,
  source: SourceInfo,
  mode: AnalysisMode,
  userPrompt: string,
): Promise<Analysis> {
  const prompts = MODE_PROMPTS[mode];
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace("{mode_instructions}", prompts.instructions)
    .replace("{summary_guidance}", prompts.summary)
    .replace("{recommendations_guidance}", prompts.recommendations)
    .replace("{tasks_guidance}", prompts.tasks);

  const userMessage = buildUserMessage(timeline, source, mode, userPrompt, prompts.findings);

  const content = await chatCompletion(
    apiKey,
    MODELS.synthesize,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    { jsonObject: true, reasoningEffort: MODELS.synthesizeReasoningEffort },
  );

  const data = JSON.parse(content || "{}");
  return toAnalysis(data, source, mode, userPrompt, timeline);
}

function buildUserMessage(
  timeline: Timeline,
  source: SourceInfo,
  mode: AnalysisMode,
  userPrompt: string,
  findingsGuidance: string,
): string {
  const lines: string[] = [];
  lines.push(`USER PROMPT: ${userPrompt}`);
  lines.push(`ANALYSIS MODE: ${mode}`);
  lines.push(`SOURCE TYPE: ${source.sourceType}`);
  if (source.title) lines.push(`SOURCE TITLE: ${source.title}`);
  if (source.limitations.length > 0) {
    lines.push("SOURCE LIMITATIONS:");
    for (const lim of source.limitations) lines.push(`  - ${lim}`);
  }

  lines.push("");
  lines.push(`FINDINGS GUIDANCE: ${findingsGuidance}`);
  lines.push("");
  lines.push("TIMELINE:");

  if (timeline.segments.length === 0) {
    lines.push("  (no segments)");
  } else {
    for (const seg of timeline.segments) {
      lines.push(`[${seg.start.toFixed(1)}s — ${seg.end.toFixed(1)}s] scene=${seg.sceneType ?? "—"}`);
      if (seg.visualSummary) lines.push(`  visual: ${seg.visualSummary}`);
      if (seg.ocr.length > 0) lines.push(`  ocr: ${seg.ocr.join(" | ")}`);
      if (seg.transcript) lines.push(`  transcript: ${seg.transcript}`);
      lines.push(`  confidence: ${seg.confidence}`);
    }
  }

  return lines.join("\n");
}

function toAnalysis(
  data: Record<string, unknown>,
  source: SourceInfo,
  mode: AnalysisMode,
  userPrompt: string,
  timeline: Timeline,
): Analysis {
  const findings: Finding[] = asArray(data.findings)
    .filter((f) => f.finding)
    .map((f) => ({
      finding: String(f.finding ?? "").trim(),
      evidence: asArray(f.evidence).map((e) => ({
        timestamp: Number(e.timestamp ?? 0),
        detail: String(e.detail ?? "").trim(),
      })),
      confidence: coerceConfidence(f.confidence),
    }));

  const recommendations: Recommendation[] = asArray(data.recommendations)
    .filter((r) => r.recommendation)
    .map((r) => ({
      recommendation: String(r.recommendation ?? "").trim(),
      rationale: r.rationale ? String(r.rationale).trim() : null,
      confidence: coerceConfidence(r.confidence),
    }));

  const tasks: AnalysisTask[] = asArray(data.tasks)
    .filter((t) => t.title)
    .map((t) => ({
      title: String(t.title ?? "").trim(),
      detail: t.detail ? String(t.detail).trim() : null,
    }));

  return {
    source,
    mode,
    prompt: userPrompt,
    summary: String(data.summary ?? "").trim(),
    timeline,
    findings,
    recommendations,
    tasks,
    limitations: asArray(data.limitations).map((x) => String(x)),
    confidence: coerceConfidence(data.confidence),
  };
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

// ── Q&A loop (ask_question.py) ──────────────────────────────────────────────

const QA_SYSTEM_PROMPT = `You are VideoLens, answering a follow-up question about a video the user has
already analysed. You have access to:
- The timeline of the video (frame summaries + transcript by time window).
- The prior analysis the user got (summary, findings, recommendations).
- The user's original prompt and chosen analysis mode.

Answer the new question grounded in the timeline. Cite specific timestamps
inline in the format \`[MM:SS]\` whenever you reference something visible or
spoken. Distinguish what is directly observed from what you are inferring.

If the timeline does not contain enough information to answer confidently,
say so plainly — do not speculate. If the question implies the user wants
recommendations, end with a short "Recommendations:" list.

Be terse, concrete, and structured. Use short paragraphs and bullet points.
Never repeat the existing executive summary verbatim — assume the user has
read it already.`;

export async function askQuestion(
  apiKey: string,
  question: string,
  timeline: Timeline,
  priorAnalysis: Analysis | null,
): Promise<string> {
  const q = question.trim();
  if (!q) throw new Error("Empty question — nothing to ask.");

  const lines: string[] = [];
  if (priorAnalysis) {
    lines.push(`ORIGINAL USER PROMPT: ${priorAnalysis.prompt}`);
    lines.push(`ANALYSIS MODE: ${priorAnalysis.mode}`);
    lines.push("");
    lines.push("PRIOR EXECUTIVE SUMMARY:");
    lines.push(priorAnalysis.summary || "(none)");
    if (priorAnalysis.findings.length > 0) {
      lines.push("");
      lines.push("PRIOR FINDINGS (one per line for context only — do not repeat):");
      for (const f of priorAnalysis.findings.slice(0, 8)) {
        lines.push(`- ${f.finding} (${f.confidence})`);
      }
    }
  }

  lines.push("");
  lines.push("TIMELINE:");
  if (timeline.segments.length === 0) {
    lines.push("  (empty)");
  } else {
    for (const seg of timeline.segments) {
      lines.push(`[${fmtTs(seg.start)}–${fmtTs(seg.end)}] scene=${seg.sceneType ?? "—"}`);
      if (seg.visualSummary) lines.push(`  visual: ${seg.visualSummary}`);
      if (seg.ocr.length > 0) lines.push(`  ocr: ${seg.ocr.join(" | ")}`);
      if (seg.transcript) lines.push(`  transcript: ${seg.transcript}`);
    }
  }
  lines.push("");
  lines.push(`NEW QUESTION: ${q}`);
  lines.push("");
  lines.push("ANSWER (cite timestamps inline as [MM:SS]):");

  const answer = await chatCompletion(
    apiKey,
    MODELS.synthesize,
    [
      { role: "system", content: QA_SYSTEM_PROMPT },
      { role: "user", content: lines.join("\n") },
    ],
    { reasoningEffort: MODELS.synthesizeReasoningEffort },
  );
  return answer.trim();
}

export function fmtTs(seconds: number): string {
  const s = Math.max(0, seconds);
  const minutes = Math.floor(s / 60);
  const secs = Math.floor(s - minutes * 60);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// Port of _estimate_cost in src/videolens/web/app.py — returns [low, high] USD.
export function estimateCost(maxFrames: number, assumedMinutes = 3.0): [number, number] {
  const perFrameLow = 0.006;
  const perFrameHigh = 0.015;
  const perMinTranscribe = 0.003;
  const synthLow = 0.03;
  const synthHigh = 0.15;

  const low =
    Math.min(maxFrames, 5) * perFrameLow +
    Math.max(0.5, assumedMinutes * 0.3) * perMinTranscribe +
    synthLow;
  const high = maxFrames * perFrameHigh + assumedMinutes * 1.5 * perMinTranscribe + synthHigh;
  return [low, high];
}
