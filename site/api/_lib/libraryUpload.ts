import { ApiError } from "./http.js";
import { normalizeRecipe } from "../../shared/recipe.js";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function libraryUpload(value: unknown) {
  const invalid = () => { throw new ApiError(400, "invalid_library_report", "Choose a valid saved VideoLens report."); };
  if (!object(value)) return invalid();
  const a = value.analysis;
  if (typeof value.id !== "string" || !value.id.length || value.id.length > 200
    || !object(a) || !object(a.source) || typeof a.summary !== "string"
    || typeof a.prompt !== "string" || typeof a.mode !== "string"
    || typeof a.source.sourceType !== "string" || !object(a.timeline)
    || !Array.isArray(a.timeline.segments)
    || ![a.findings, a.recommendations, a.tasks, a.limitations, value.qa].every(Array.isArray)
    || !(value.qa as unknown[]).every(q => object(q) && typeof q.question === "string" && typeof q.answer === "string")) return invalid();
  for (const timestamp of [value.createdAt, value.updatedAt]) {
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp < 0
      || timestamp > Date.now() + 300_000) return invalid();
  }
  if ((value.updatedAt as number) < (value.createdAt as number)) return invalid();
  if (value.managedReportId != null && (typeof value.managedReportId !== "string" || !uuid.test(value.managedReportId))) return invalid();
  const pick = (input: unknown, fields: string[]): Record<string, unknown> => {
    if (!object(input)) return invalid();
    return Object.fromEntries(fields.filter(field => input[field] !== undefined).map(field => [field, input[field]]));
  };
  // Explicitly select the report fields: never forward local storage, keys or raw media.
  const recipe = normalizeRecipe(a.recipe, typeof a.source.durationSeconds === "number" ? a.source.durationSeconds : null);
  if ((a.mode === "recipe" || a.recipe != null) && !recipe) return invalid();
  const reportData = {
    ...(recipe ? { recipe } : {}),
    source: { sourceType: a.source.sourceType, title: a.source.title, url: a.source.url,
      durationSeconds: a.source.durationSeconds, limitations: a.source.limitations },
    mode: a.mode, outputLanguage: a.outputLanguage, prompt: a.prompt, summary: a.summary,
    timeline: { segments: a.timeline.segments.map(segment => pick(segment, ["start", "end", "sceneType", "transcript", "ocr", "visualSummary", "confidence"])) },
    findings: (a.findings as unknown[]).map(finding => {
      if (!object(finding) || !Array.isArray(finding.evidence)) return invalid();
      return { ...pick(finding, ["finding", "confidence"]), evidence: finding.evidence.map(e => pick(e, ["timestamp", "detail"])) };
    }),
    recommendations: (a.recommendations as unknown[]).map(r => pick(r, ["recommendation", "rationale", "confidence"])),
    tasks: (a.tasks as unknown[]).map(task => pick(task, ["title", "detail"])),
    limitations: a.limitations, confidence: a.confidence,
    qa: (value.qa as Record<string, unknown>[]).map(q => ({ question: q.question, answer: q.answer })),
  };
  return {
    localId: value.id, managedReportId: value.managedReportId ?? null,
    createdAt: new Date(value.createdAt as number).toISOString(),
    updatedAt: new Date(value.updatedAt as number).toISOString(),
    title: (typeof a.source.title === "string" ? a.source.title.trim() : "").slice(0, 300) || "Untitled video",
    sourceType: a.source.sourceType.slice(0, 80), mode: a.mode.slice(0, 80), reportData,
  };
}
