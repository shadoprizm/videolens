import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { build } from "esbuild";
import { indexedDB } from "fake-indexeddb";

const bundled = await build({ stdin: { contents: 'export * from "./src/lib/cloudLibrary"; export * from "./src/lib/reportLibrary"; export * from "./src/lib/storage";', resolveDir: process.cwd() }, bundle: true, format: "esm", write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
globalThis.indexedDB = indexedDB;
let stored;
let requests;
beforeEach(async () => {
  stored = { proToken: "token", proEmail: "one@example.test", proCloudSave: true };
  requests = [];
  globalThis.chrome = { storage: { local: {
    get: async () => ({ ...stored }),
    set: async values => Object.assign(stored, values),
    remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key]; },
  } } };
  globalThis.fetch = async (_url, init) => { requests.push(JSON.parse(init.body)); return Response.json({ saved: true }); };
  await api.clearReportLibrary();
});
function analysis(title) {
  return { source: { sourceType: "local_file", title, url: null, durationSeconds: 1, limitations: [] }, mode: "general", prompt: "Summarize", summary: "Report", timeline: { segments: [] }, findings: [], recommendations: [], tasks: [], limitations: [], confidence: "high" };
}

test("old managed-only consent does not upload BYOK; new consent is account scoped", async () => {
  assert.equal(await api.getCloudLibraryEnabled(), false);
  await api.setCloudLibraryEnabled(true);
  assert.equal(await api.getCloudLibraryEnabled(), true);
  await api.setProSession({ token: "second", email: "two@example.test" });
  assert.equal(await api.getCloudLibraryEnabled(), false);
  await api.setCloudLibraryEnabled(true);
  await api.setProSession(null);
  assert.equal(await api.getCloudLibraryEnabled(), false);
});

test("uploads the whole library with follow-ups, retains local copies and retries stable IDs", async () => {
  const first = await api.saveReport({ analysis: analysis("BYOK"), qa: [{ question: "Next?", answer: "Test" }] });
  await api.saveReport({ analysis: analysis("Managed"), qa: [], managedReportId: "11111111-1111-4111-8111-111111111111" });
  const updates = [];
  assert.equal((await api.uploadLocalLibrary("token", p => updates.push(p))).done, 2);
  assert.equal(await api.countSavedReports(), 2);
  assert.deepEqual(requests.find(r => r.report.id === first.id).report.qa, [{ question: "Next?", answer: "Test" }]);
  await api.uploadLocalLibrary("token", () => {});
  assert.equal(new Set(requests.map(r => r.report.id)).size, 2);
  assert.equal(updates.at(-1).done, 2);
});

test("partial failure keeps successes and local copies; retry completes", async () => {
  await api.saveReport({ analysis: analysis("First"), qa: [] });
  await api.saveReport({ analysis: analysis("Second"), qa: [] });
  let count = 0;
  globalThis.fetch = async () => ++count === 1 ? Response.json({ message: "offline" }, { status: 503 }) : Response.json({ saved: true });
  const result = await api.uploadLocalLibrary("token", () => {});
  assert.equal(result.failed, 1);
  assert.equal(result.done, 1);
  assert.equal(await api.countSavedReports(), 2);
  assert.equal((await api.uploadLocalLibrary("token", () => {})).done, 2);
});

test("disconnect or cancellation stops the remaining uploads", async () => {
  await api.saveReport({ analysis: analysis("First"), qa: [] });
  await api.saveReport({ analysis: analysis("Second"), qa: [] });
  let stop = false;
  const result = await api.uploadLocalLibrary("token", p => { if (p.done === 1) stop = true; }, () => stop);
  assert.equal(result.cancelled, true);
  assert.equal(result.done, 1);
  assert.equal(requests.length, 1);
  await api.setProSession(null);
  assert.equal((await api.uploadLocalLibrary("token", () => {})).cancelled, true);
});
