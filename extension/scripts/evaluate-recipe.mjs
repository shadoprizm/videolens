// Real-provider evaluation of a local clip using the shipping recipe pipeline.
// Usage: node scripts/evaluate-recipe.mjs VIDEO OUTPUT_DIR [METADATA_JSON]
// OPENAI_API_KEY for direct access; VIDEOLENS_RECIPE_GATEWAY=1 with an
// AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN for the managed provider transport.
// Optional: RECIPE_LOOKUP=1, RECIPE_WITHHOLD_DESCRIPTION=1. Never prints credentials.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [videoArg, outputArg, metadataArg] = process.argv.slice(2);
if (!videoArg || !outputArg) throw new Error("Usage: evaluate-recipe.mjs VIDEO OUTPUT_DIR [METADATA_JSON]");
const video = resolve(videoArg), output = resolve(outputArg);
mkdirSync(output, { recursive: true });
const gateway = process.env.VIDEOLENS_RECIPE_GATEWAY === "1";
const key = gateway ? process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN : process.env.OPENAI_API_KEY;
if (!key) throw new Error("Configure the evaluation provider credential in the environment.");
const stats = { requests: 0, inputTokens: 0, outputTokens: 0, providerCostUsd: 0, failures: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  let target = String(url), options = init;
  if (target.startsWith("https://api.openai.com/v1/")) {
    stats.requests++;
    if (gateway) {
      target = target.replace("https://api.openai.com", "https://ai-gateway.vercel.sh");
      const body = JSON.parse(init.body);
      body.model = `openai/${body.model}`;
      options = { ...init, body: JSON.stringify(body), headers: { ...init.headers, "ai-gateway-auth-method": process.env.AI_GATEWAY_API_KEY ? "api-key" : "oidc", "ai-gateway-protocol-version": "0.0.1" } };
    }
  }
  const res = await realFetch(target, options);
  if (!res.ok) stats.failures++;
  const data = await res.clone().json().catch(() => ({}));
  stats.inputTokens += data.usage?.prompt_tokens ?? data.usage?.input_tokens ?? 0;
  stats.outputTokens += data.usage?.completion_tokens ?? data.usage?.output_tokens ?? 0;
  stats.providerCostUsd += Number(data.usage?.cost ?? 0);
  return res;
};
const load = async entry => {
  const result = await build({ entryPoints: [resolve(root, entry)], bundle: true, format: "esm", write: false, platform: "browser" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
};
const [recipe, vision, timelineModule, analysisModule, report] = await Promise.all([
  "src/lib/recipe.ts", "src/lib/describeFrames.ts", "src/lib/timeline.ts", "src/lib/recipeAnalysis.ts", "src/lib/report.ts",
].map(load));
const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", video], { encoding: "utf8" }).trim());
const metadata = metadataArg ? JSON.parse(readFileSync(resolve(metadataArg), "utf8")) : {};
const source = { sourceType: metadata.webpage_url ? "youtube" : "local_file", url: metadata.webpage_url ?? null, title: metadata.title ?? "Recipe evaluation clip", durationSeconds: duration, limitations: ["Evaluation uses visual frames and optional creator description; audio is withheld."] };
const frames = [];
for (const [index, timestamp] of recipe.recipeFrameTimestamps(duration).entries()) {
  const path = resolve(output, `frame-${String(index).padStart(3, "0")}.jpg`);
  if (!existsSync(path)) execFileSync("ffmpeg", ["-v", "error", "-ss", String(timestamp), "-i", video, "-frames:v", "1", "-vf", "scale=720:720:force_original_aspect_ratio=decrease", "-q:v", "3", "-y", path]);
  frames.push({ timestamp, dataUrl: `data:image/jpeg;base64,${readFileSync(path).toString("base64")}` });
}
const started = Date.now(), access = { kind: "byok", apiKey: key };
console.log({ stage: "captured", frames: frames.length, duration });
const summaryPath = resolve(output, "observations.json");
const summaries = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, "utf8")) : await vision.describeRecipeFrames(access, frames, (done, total) => { if (done % 20 === 0 || done === total) console.log({ stage: "vision", done, total }); });
writeFileSync(summaryPath, JSON.stringify(summaries, null, 2));
if (summaries.length < Math.ceil(frames.length / 2)) throw new Error("Insufficient frame analysis");
const timeline = timelineModule.buildTimeline(summaries, null, duration);
const creatorText = process.env.RECIPE_WITHHOLD_DESCRIPTION === "1" ? "" : metadata.description ?? "";
const context = { creatorText, sources: creatorText && source.url ? [{ id: "creator-description", title: "Creator description", url: source.url, kind: "creator" }] : [], researchText: "", research: "not_requested" };
const analysis = await analysisModule.analyzeRecipeWithResearch(access, timeline, source, "Reconstruct this recipe. Preserve missing measurements as unknown unless a justified estimate is useful. Do not assume a recipe from its title.", "en", context, process.env.RECIPE_LOOKUP === "1", () => console.log({ stage: "online_lookup" }));
writeFileSync(resolve(output, "analysis.json"), JSON.stringify(analysis, null, 2));
writeFileSync(resolve(output, "report.html"), report.toHtmlReport(analysis, []));
writeFileSync(resolve(output, "report.md"), report.toMarkdown(analysis, []));
const evaluation = { title: source.title, url: source.url, duration, sampledFrames: frames.length, analyzedFrames: summaries.length, descriptionWithheld: !creatorText, research: analysis.recipe.research, elapsedSeconds: (Date.now() - started) / 1000, ...stats };
writeFileSync(resolve(output, "run.json"), JSON.stringify(evaluation, null, 2));
console.log(evaluation);
