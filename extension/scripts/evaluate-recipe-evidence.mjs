// 20 controlled evidence scenarios. These are model evaluations, not real videos
// or kitchen tests. Configure the same provider environment as evaluate-recipe.mjs.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] || "../output/recipe-preview/evidence-eval");
mkdirSync(out, { recursive: true });
const cases = JSON.parse(readFileSync(resolve(root, "evaluation/recipe-cases.json"), "utf8"));
const bundle = await build({ entryPoints: [resolve(root, "src/lib/analyze.ts")], bundle: true, format: "esm", write: false, platform: "browser" });
const { analyzeTimeline } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const gateway = process.env.VIDEOLENS_RECIPE_GATEWAY === "1";
const key = gateway ? process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN : process.env.OPENAI_API_KEY;
if (!key) throw new Error("Configure the evaluation provider credential.");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (gateway && String(url).startsWith("https://api.openai.com/v1/")) {
    const body = JSON.parse(init.body); body.model = `openai/${body.model}`;
    return originalFetch(String(url).replace("https://api.openai.com", "https://ai-gateway.vercel.sh"), { ...init, body: JSON.stringify(body), headers: { ...init.headers, "ai-gateway-auth-method": process.env.AI_GATEWAY_API_KEY ? "api-key" : "oidc", "ai-gateway-protocol-version": "0.0.1" } });
  }
  return originalFetch(url, init);
};
function check(c, r) {
  const amount = r?.ingredients.find(i => i.ingredient.value?.toLowerCase().includes(c.ingredient))?.amount;
  const has = (v, needle) => String(v ?? "").toLowerCase().includes(needle.toLowerCase());
  switch (c.check) {
    case "unknown_amount": return amount?.value === null;
    case "amount": return amount?.basis === "video" && has(amount.value, c.contains) && (!c.unit || has(amount.value, c.unit));
    case "creator_amount": return amount?.basis === "creator" && has(amount.value, c.contains);
    case "unknown_cook_time": return r?.cookTime.value === null;
    case "unknown_servings": return r?.servings.value === null;
    case "unknown_temperature": return r?.steps.every(s => s.temperature.value === null);
    case "temperature": return r?.steps.some(s => s.temperature.basis === "video" && has(s.temperature.value, c.contains) && (!c.unit || has(s.temperature.value, c.unit)));
    case "conflict": return r?.gaps.some(g => /conflict|contradict|differ|150.*200|200.*150/i.test(g));
    case "no_injected_quantity": return !JSON.stringify(r?.ingredients).includes("999");
    case "not_observed_amount": return amount && ["unknown", "estimate"].includes(amount.basis);
    case "no_leavening": return r?.ingredients.every(i => !/baking powder|baking soda|yeast/i.test(i.ingredient.value));
    case "no_rest_time": return r?.steps.every(s => !/rest/i.test(s.instruction.value) || s.duration.value === null);
    case "reject": return !r;
    default: throw new Error("Unknown check");
  }
}
const results = [];
let next = 0;
async function worker() {
  while (next < cases.length) {
    const c = cases[next++];
    const context = { creatorText: c.creator || "", researchText: c.research || "", research: c.research ? "completed" : "not_requested", sources: [
      ...(c.creator ? [{ id: "creator-description", url: "https://example.com/creator", title: "Creator description", kind: "creator" }] : []),
      ...(c.research ? [{ id: "web-1", url: "https://example.com/comparison", title: "Comparison recipe", kind: "reference" }] : []),
    ] };
    const timeline = { segments: [{ start: 0, end: 10, visualSummary: c.evidence, ocr: c.ocr || [], transcript: c.transcript || null, sceneType: "cooking", confidence: "high" }] };
    let analysis, error;
    try {
      analysis = await analyzeTimeline({ kind: "byok", apiKey: key }, timeline, { sourceType: "local_file", title: `Evidence test: ${c.id}`, url: null, durationSeconds: 10, limitations: [] }, "recipe", "Extract the supported recipe. Leave absent measurements and timings unknown. Do not suggest estimates for this evaluation.", "en", context);
    } catch (e) { error = e.message; }
    const passed = error ? c.check === "reject" && /No usable cooking recipe/.test(error) : Boolean(check(c, analysis?.recipe));
    writeFileSync(resolve(out, `${c.id}.json`), JSON.stringify({ case: c, passed, analysis, error }, null, 2));
    results.push({ id: c.id, passed, error });
    console.log({ id: c.id, passed, error });
  }
}
await Promise.all([worker(), worker()]);
const summary = { kind: "controlled evidence scenarios; not video or kitchen tests", total: cases.length, passed: results.filter(r => r.passed).length, results };
writeFileSync(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
console.log({ total: summary.total, passed: summary.passed });
if (summary.passed !== summary.total) process.exitCode = 1;
