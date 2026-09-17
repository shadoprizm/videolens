import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/storage.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const source = bundle.outputFiles[0].text;
const storage = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("first-report completion is false by default and persists once marked", async () => {
  const originalChrome = globalThis.chrome;
  const localState = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ ...localState }),
        set: async (values) => Object.assign(localState, values),
        remove: async () => undefined,
      },
    },
  };

  try {
    assert.equal(await storage.hasCompletedFirstReport(), false);
    await storage.markFirstReportCompleted();
    assert.equal(await storage.hasCompletedFirstReport(), true);
    assert.equal(localState.hasCompletedFirstReport, true);
  } finally {
    globalThis.chrome = originalChrome;
  }
});


test("account-first defaults preserve explicit choices and legacy key-only installations", async () => {
  const originalChrome = globalThis.chrome;
  try {
    for (const [saved, expected] of [
      [{}, "pro"],
      [{ openaiApiKey: "sk-existing" }, "byok"],
      [{ analysisProvider: "byok" }, "byok"],
      [{ analysisProvider: "pro", openaiApiKey: "sk-existing" }, "pro"],
      [{ proToken: "session", proEmail: "member@example.invalid" }, "pro"],
    ]) {
      globalThis.chrome = { storage: { local: { get: async () => ({ ...saved }) } } };
      assert.equal(await storage.getAnalysisProvider(), expected);
    }
  } finally { globalThis.chrome = originalChrome; }
});
