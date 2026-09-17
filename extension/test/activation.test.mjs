import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["src/lib/activation.ts"], bundle: true, format: "esm", platform: "browser", write: false });
const { failureCode, recoveryHint, needsManagedContinuation } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
test("recovery guidance distinguishes setup, source, provider and connection failures", () => {
  for (const [message, code] of [["Allow access to video", "permission"], ["No video found", "source"], ["401 API key rejected", "authentication"], ["429 rate limit", "rate_limit"], ["Failed to fetch", "network"], ["Unknown", "analysis"]]) {
    assert.equal(failureCode(new Error(message)), code);
    assert.ok(recoveryHint(code).length > 20);
    assert.ok(!recoveryHint(code).includes(message));
  }
});
test("continuation is offered only after a managed starter has exhausted free allowance", () => {
  assert.equal(needsManagedContinuation({ plan: "free", managedReportsRemaining: 0 }, "report"), true);
  assert.equal(needsManagedContinuation({ plan: "pro", managedReportsRemaining: 0 }, "report"), false);
  assert.equal(needsManagedContinuation({ plan: "free", managedReportsRemaining: 1 }, "report"), false);
  assert.equal(needsManagedContinuation({ plan: "free", managedReportsRemaining: 0 }, null), false);
});
