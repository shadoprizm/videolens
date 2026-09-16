import { describe, expect, it, vi, beforeEach } from "vitest";
import { libraryUpload } from "../api/_lib/libraryUpload.js";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), rpc: vi.fn() }));
vi.mock("../api/_lib/auth.js", () => ({ authenticate: mocks.authenticate }));
vi.mock("../api/_lib/supabase.js", () => ({ supabaseAdmin: () => ({ rpc: mocks.rpc }) }));
import { handler } from "../api/reports.js";

const report = () => ({ id: "local-1", createdAt: 1_700_000_000_000, updatedAt: 1_700_000_001_000,
  analysis: { source: { sourceType: "local_file", title: "Saved report" }, mode: "general", summary: "Summary", prompt: "Prompt", timeline: { segments: [] }, findings: [], recommendations: [], tasks: [], limitations: [] },
  qa: [{ question: "Next?", answer: "Keep it" }],
});

describe("existing report uploads", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authenticate.mockResolvedValue({ id: "account-a" }); mocks.rpc.mockResolvedValue({ data: "cloud-id", error: null }); });
  it("preserves source dates and answers while stripping unrelated fields", () => {
    const data = libraryUpload({ ...report(), apiKey: "must-not-upload", user_id: "other" });
    expect(data.reportData.qa).toEqual(report().qa);
    expect(data.createdAt).toBe("2023-11-14T22:13:20.000Z");
    expect(JSON.stringify(data)).not.toContain("must-not-upload");
    expect(data.localId).toBe("local-1");
  });
  it("rejects invalid IDs, dates, report structures and follow-up data", () => {
    for (const bad of [null, {}, { ...report(), id: "" }, { ...report(), updatedAt: -1 }, { ...report(), createdAt: 1e30 }, { ...report(), qa: ["bad"] }, { ...report(), managedReportId: "bad" }]) {
      expect(() => libraryUpload(bad)).toThrow();
    }
  });
  it("uses the authenticated owner and never reserves AI credits", async () => {
    const response = await handler(new Request("https://videolens.io/api/reports", { method: "POST", body: JSON.stringify({ action: "upload", user_id: "attacker", report: report() }) }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("upload_library_report", { p_user_id: "account-a", p_report: libraryUpload(report()) });
  });
  it("invalid uploads never reach the database", async () => {
    const response = await handler(new Request("https://videolens.io/api/reports", { method: "POST", body: JSON.stringify({ action: "upload", report: {} }) }));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
