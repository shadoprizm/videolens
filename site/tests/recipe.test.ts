import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { libraryUpload } from "../api/_lib/libraryUpload.js";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), record: vi.fn(), finish: vi.fn() }));
vi.mock("../api/_lib/auth.js", () => ({ authenticate: mocks.authenticate }));
vi.mock("../api/_lib/entitlements.js", () => ({ recordAiRequest: mocks.record }));
vi.mock("../api/_lib/managed-ai.js", async importOriginal => ({ ...await importOriginal<typeof import("../api/_lib/managed-ai.js")>(), finishAiRequest: mocks.finish }));
import { handler } from "../api/ai.js";

const fixture = () => JSON.parse(readFileSync(new URL("../../extension/test/fixtures/recipe.json", import.meta.url), "utf8"));
const searchResponse = () => ({ status: "completed", output: [{ type: "web_search_call", status: "completed" }, { type: "message", content: [{ type: "output_text", text: "Recipe detail", annotations: [{ type: "url_citation", url: "https://example.com/recipe", title: "Recipe source" }] }] }] });
const request = (body: unknown) => new Request("https://videolens.io/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("recipe storage", () => {
  it("keeps structured facts and sources while removing unrelated data", () => {
    const analysis = fixture();
    analysis.recipe.apiKey = "secret-never-save";
    analysis.recipe.ingredients[0].amount.rawFrame = "raw-never-save";
    const result = libraryUpload({ id: "local-recipe", createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000, analysis, qa: [] });
    expect(result.reportData.recipe?.ingredients[1].amount.value).toBeNull();
    expect(result.reportData.recipe?.sources).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/secret-never-save|raw-never-save/);
  });
  it("rejects a recipe with no usable ingredients or steps", () => {
    const analysis = fixture(); analysis.recipe = {};
    expect(() => libraryUpload({ id: "local-recipe", createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000, analysis, qa: [] })).toThrow();
  });
});

describe("managed recipe lookup", () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); mocks.authenticate.mockResolvedValue({ id: "owner", source: "extension" }); mocks.record.mockResolvedValue(42); mocks.finish.mockResolvedValue(undefined); });
  it("checks extension authentication before any lookup or quota write", async () => {
    mocks.authenticate.mockResolvedValue({ id: "owner", source: "website" });
    const response = await handler(request({ kind: "recipe_research", reportId: "r", input: "Cookies" }));
    expect(response.status).toBe(403); expect(mocks.record).not.toHaveBeenCalled();
  });
  it("validates lookup size before reserving a managed request", async () => {
    for (const input of ["", "x".repeat(18_001), 42]) expect((await handler(request({ kind: "recipe_research", reportId: "r", input }))).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("binds lookup to the owner's report and enforces a fixed bounded provider request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "managed-test-key");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(searchResponse())));
    try {
      const response = await handler(request({ kind: "recipe_research", reportId: "report", input: "Cookie gaps", model: "arbitrary", max_tool_calls: 500 }));
      expect(response.status).toBe(200);
      expect(mocks.record).toHaveBeenCalledExactlyOnceWith("owner", "report", "chat");
      const sent = JSON.parse(fetch.mock.calls[0][1]?.body as string);
      expect(sent.model).toBe("gpt-5.4-mini"); expect(sent.max_tool_calls).toBe(3); expect(sent.store).toBe(false);
      expect(mocks.finish).toHaveBeenCalledWith(42, expect.objectContaining({ outcome: "succeeded" }));
    } finally { vi.unstubAllEnvs(); }
  });
  it("does not report a citation-free answer as successful research", async () => {
    vi.stubEnv("OPENAI_API_KEY", "managed-test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [] })));
    try {
      expect((await handler(request({ kind: "recipe_research", reportId: "r", input: "Cookies" }))).status).toBe(502);
      expect(mocks.finish).toHaveBeenCalledWith(42, expect.objectContaining({ outcome: "failed" }));
    } finally { vi.unstubAllEnvs(); }
  });
});
