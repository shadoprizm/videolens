import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { indexedDB } from "fake-indexeddb";

const load = async entry => {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "browser" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
};
const [recipe, rendering, analyze, frames, research, client, library, cloud] = await Promise.all([
  "src/lib/recipe.ts", "src/lib/recipeReport.ts", "src/lib/analyze.ts", "src/lib/describeFrames.ts", "src/lib/recipeResearch.ts", "src/lib/openai.ts", "src/lib/reportLibrary.ts", "../site/cloud-report.ts",
].map(load));
const fixture = () => JSON.parse(readFileSync("test/fixtures/recipe.json", "utf8"));
const response = content => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));

test("recipe sampling captures half-second moments and respects the longer-clip budget", () => {
  const stamps = recipe.recipeFrameTimestamps(60);
  assert.equal(stamps.length, 120);
  assert.equal(stamps[1], 0.5);
  assert.equal(stamps.at(-1), 59.5);
  assert.equal(recipe.recipeFrameTimestamps(30).length, 60);
  assert.equal(recipe.recipeFrameTimestamps(180).length, 120);
  assert.equal(recipe.recipeFrameTimestamps(180)[1], 1.5);
  for (const duration of [0, -1, NaN, Infinity]) assert.throws(() => recipe.recipeFrameTimestamps(duration));
});

test("ingredient identity and quantity retain separate provenance; invented citations cannot establish facts", () => {
  const f = fixture().recipe;
  f.ingredients[1].amount = { value: "200 g", basis: "video", timestamps: [-1, 200, Infinity], sourceIds: ["invented"], note: "" };
  f.sources.push({ id: "bad", title: "Bad", url: "javascript:alert(1)", kind: "creator" });
  const normalized = recipe.normalizeRecipe(f, 30);
  assert.equal(normalized.ingredients[0].amount.basis, "video");
  assert.equal(normalized.ingredients[1].ingredient.basis, "creator");
  assert.equal(normalized.ingredients[1].amount.basis, "estimate");
  assert.deepEqual(normalized.ingredients[1].amount.timestamps, []);
  assert.equal(normalized.sources.length, 1);
  assert.equal(normalized.cookTime.value, null);
});

test("recipe synthesis supplies creator evidence, preserves unknowns, and rejects non-cooking output", async () => {
  const f = fixture(), original = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, init) => { body = JSON.parse(init.body); return response(f); };
  try {
    const result = await analyze.analyzeTimeline({ kind: "byok", apiKey: "test" }, f.timeline, f.source, "recipe", f.prompt, "en", { creatorText: "Contains flour", sources: f.recipe.sources, researchText: "", research: "not_requested" });
    assert.equal(result.recipe.ingredients[1].amount.value, null);
    assert.match(body.messages[0].content, /ingredient's identity and its amount have independent provenance/);
    assert.match(body.messages[1].content, /Contains flour/);
    globalThis.fetch = async () => response({ recipe: null });
    await assert.rejects(analyze.analyzeTimeline({ kind: "byok", apiKey: "test" }, f.timeline, f.source, "recipe", f.prompt), /No usable cooking recipe/);
  } finally { globalThis.fetch = original; }
});

test("neighboring cooking frames are sent together with their exact timestamps", async () => {
  const original = globalThis.fetch, sizes = [], progress = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body), parts = body.messages[1].content;
    const times = parts.filter(p => p.type === "text" && p.text.startsWith("Frame at")).map(p => Number(p.text.split(" ")[2]));
    sizes.push(parts.filter(p => p.type === "image_url").length);
    return response({ frames: times.map(timestamp => ({ timestamp, visual_summary: "Egg added", extracted_text: ["2 eggs"], confidence: "high" })) });
  };
  try {
    const result = await frames.describeRecipeFrames({ kind: "byok", apiKey: "test" }, Array.from({ length: 6 }, (_, i) => ({ timestamp: i * 0.5, dataUrl: "data:image/jpeg;base64,AA==" })), (d, t) => progress.push([d, t]));
    assert.deepEqual(sizes.sort(), [2, 4]);
    assert.deepEqual(result.map(f => f.timestamp), [0, 0.5, 1, 1.5, 2, 2.5]);
    assert.deepEqual(progress.at(-1), [6, 6]);
  } finally { globalThis.fetch = original; }
});

test("failed cooking groups are retried once and never fabricated", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Offline"); };
  try {
    const result = await frames.describeRecipeFrames({ kind: "byok", apiKey: "test" }, [{ timestamp: 0, dataUrl: "x" }], () => {});
    assert.deepEqual(result, []);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

const researched = () => ({ status: "completed", output: [
  { type: "web_search_call", status: "completed" },
  { type: "message", content: [{ type: "output_text", text: "A comparison recipe uses 200 g of flour.", annotations: [{ type: "url_citation", url: "https://example.com/cookies", title: "Comparison recipe" }] }] },
] });

test("online evidence requires completed search and provider-supplied citations", () => {
  assert.equal(research.parseRecipeResearch(researched()).sources[0].kind, "reference");
  for (const invalid of [{ output: [] }, { output: researched().output.slice(1) }, { ...researched(), status: "incomplete" }]) assert.throws(() => research.parseRecipeResearch(invalid));
  const bad = researched(); bad.output[1].content[0].annotations[0].url = "javascript:alert(1)";
  assert.throws(() => research.parseRecipeResearch(bad));
  assert.equal(research.recipeResearchPayload("input").store, false);
  assert.equal(research.recipeResearchPayload("input").max_tool_calls, 3);
});

test("lookup keeps BYOK credentials direct and uses the reservation for managed lookup", async () => {
  const original = globalThis.fetch, requests = [];
  globalThis.fetch = async (url, init) => { requests.push({ url, body: JSON.parse(init.body), headers: init.headers }); return new Response(JSON.stringify(researched())); };
  try {
    await client.researchRecipe({ kind: "byok", apiKey: "private-key" }, "Cookie gaps");
    await client.researchRecipe({ kind: "pro", token: "session", reportId: "reserved" }, "Cookie gaps");
    assert.equal(requests[0].url, "https://api.openai.com/v1/responses");
    assert.equal(requests[1].body.kind, "recipe_research");
    assert.equal(requests[1].body.reportId, "reserved");
    assert.equal(JSON.stringify(requests[1]).includes("private-key"), false);
  } finally { globalThis.fetch = original; }
});

test("recipe cards safely render separate source labels and working Shorts timestamp links", () => {
  const f = fixture(); f.recipe.title = '<img src=x onerror="attack()">';
  const html = rendering.recipeHtml(f.recipe, "en", f.source.url, 30);
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img/);
  assert.match(html, /watch\?v=recipe-test&amp;t=0s/);
  assert.match(html, /No measurement is shown/);
  assert.match(rendering.recipeMarkdown(f.recipe, "fr"), /Ingrédients/);
  const stored = { id: "r", title: "Cookies", mode: "recipe", source_type: "youtube", report_data: f, created_at: "2026-09-14", completed_at: null };
  assert.match(cloud.reportBody(stored), /recipe-card/);
  assert.match(cloud.reportMarkdown(stored), /Flour quantity is missing/);
});

test("recipe data survives local save, search, export and restore", async () => {
  const original = globalThis.indexedDB;
  globalThis.indexedDB = indexedDB;
  try {
    const saved = await library.saveReport({ analysis: fixture(), qa: [] });
    const reopened = await library.getSavedReport(saved.id);
    assert.deepEqual(reopened.analysis.recipe, fixture().recipe);
    assert.ok((await library.listSavedReports({ query: "Flour" })).reports.some(r => r.id === saved.id));
    const backup = await library.exportReportLibrary();
    await library.deleteSavedReport(saved.id);
    await library.importReportLibrary(backup.json);
    assert.deepEqual((await library.getSavedReport(saved.id)).analysis.recipe, fixture().recipe);
  } finally { globalThis.indexedDB = original; }
});
