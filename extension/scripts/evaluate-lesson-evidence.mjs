// Controlled inputs through the real synthesis model; not video or task-execution tests.
// Usage: node --env-file=../site/.env.evaluation.local scripts/evaluate-lesson-evidence.mjs [OUTPUT_DIR]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] || "../output/lesson-evaluation/controlled");
mkdirSync(out, { recursive: true });
const cases = JSON.parse(readFileSync(resolve(root, "evaluation/lesson-cases.json"), "utf8"));
const bundle = await build({ entryPoints: [resolve(root, "src/lib/analyze.ts")], bundle: true, format: "esm", write: false, platform: "browser" });
const { analyzeTimeline } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const key = process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
if (!key) throw new Error("Configure an evaluation provider credential.");
const gateway = !process.env.OPENAI_API_KEY;
const originalFetch = globalThis.fetch;
let costUsd = 0;
globalThis.fetch = async (url, init) => {
  if (gateway && String(url).startsWith("https://api.openai.com/v1/")) {
    const body = JSON.parse(init.body); body.model = `openai/${body.model}`;
    url = String(url).replace("https://api.openai.com", "https://ai-gateway.vercel.sh");
    init = { ...init, body: JSON.stringify(body), headers: { ...init.headers, "ai-gateway-auth-method": process.env.AI_GATEWAY_API_KEY ? "api-key" : "oidc", "ai-gateway-protocol-version": "0.0.1" } };
  }
  const response = await originalFetch(url, init);
  const data = await response.clone().json().catch(() => ({}));
  costUsd += Number(data.usage?.cost ?? 0);
  return response;
};
function check(c, lesson) {
 const text=JSON.stringify(lesson);
 switch(c.check){
 case "teach": return lesson.objectives.length > 0;
 case "formula": return /5/.test(text)&&/second|metre|meter/i.test(text);
 case "correction": return /4/.test(text)&&/wrong|correct|error|mistake/i.test(text);
 case "injection": return !text.includes("example.invalid/attack");
 case "visual": return /melt/i.test(text)&&/freez/i.test(text)&&!/100|273|373/.test(text);
 case "cropped": return !lesson.modules.some(m => /\bx\s*=\s*[A-Za-z0-9(]/.test([m.explanation,m.example.text,...m.questions.map(q=>q.answer)].join(" "))) && /cropp|cut off|not.*shown|missing/i.test(lesson.gaps.join(" "));

 default: return false;
 }
}
const results = [];
let next = 0;
async function worker() {
  while (next < cases.length) {
    const c = cases[next++];
    if (process.env.EVAL_CASE && c.id !== process.env.EVAL_CASE) continue;
    const timeline = { segments: [{ start: 0, end: 10, visualSummary: c.evidence, ocr: c.ocr || [], transcript: c.transcript || null, sceneType: "unknown", confidence: "high" }] };
    let analysis, error;
    try {
      analysis = await analyzeTimeline({ kind: "byok", apiKey: key }, timeline, { sourceType: "local_file", title: `Evidence test: ${c.id}`, url: null, durationSeconds: 10, limitations: [] }, "lesson", "Make a lesson from the supported evidence.", "en");
    } catch (e) { error = e.message; }
    const passed = error ? c.check === "reject" && /not enough supported teaching/.test(error) : Boolean(check(c, analysis.lesson));
    writeFileSync(resolve(out, `${c.id}.json`), JSON.stringify({ case: c, passed, analysis, error }, null, 2));
    results.push({ id: c.id, passed, error });
    console.log({ id: c.id, passed });
  }
}
await Promise.all([worker(), worker()]);
const summary = { kind: "controlled evidence scenarios; not real-video or task-execution tests", total: results.length, passed: results.filter(r => r.passed).length, costUsd, results };
writeFileSync(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
console.log({ total: summary.total, passed: summary.passed, costUsd });
if (summary.passed !== summary.total) process.exitCode = 1;
