import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ authenticate: vi.fn(), entitlement: vi.fn(), from: vi.fn(), queries: [] as unknown[] }));
vi.mock("../api/_lib/auth.js", () => ({ authenticate: m.authenticate }));
vi.mock("../api/_lib/entitlements.js", () => ({ getEntitlement: m.entitlement, reserveReport: vi.fn() }));
vi.mock("../api/_lib/supabase.js", () => ({ supabaseAdmin: () => ({ from: m.from }) }));
import { handler } from "../api/reports.js";
function request(status = "complete") { return new Request("https://videolens.io/api/reports", { method: "POST", body: JSON.stringify({ action: "complete", reportId: "r", status, cloudSave: false }) }); }
function chain(data: unknown) {
  const calls: unknown[] = []; m.queries.push(calls);
  const q = { update: (value: unknown) => { calls.push(["update",value]); return q; }, eq: (key: string, value: unknown) => { calls.push([key,value]); return q; }, select: () => q, maybeSingle: async () => ({ data, error: null }) };
  return q;
}
beforeEach(() => { vi.resetAllMocks(); m.queries.length=0; m.authenticate.mockResolvedValue({ id: "owner" }); m.entitlement.mockResolvedValue({ managedReportsRemaining: 1 }); });
it.each(["complete", "failed"])("safely acknowledges a retry of an already recorded %s outcome", async status => {
  m.from.mockReturnValueOnce(chain(null)).mockReturnValueOnce(chain({ id: "r", status, cloud_saved: false }));
  const result = await handler(request(status)); expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ reportId: "r", saved: false });
  for (const query of m.queries) expect(query).toContainEqual(["user_id","owner"]);
});
it.each([null, { id: "r", status: "failed" }])("never changes a conflicting or another owner's completed record", async existing => {
  m.from.mockReturnValueOnce(chain(null)).mockReturnValueOnce(chain(existing));
  expect((await handler(request())).status).toBe(409);
});
it("only transitions pending reports, preserving a finished report on retries", async () => {
  m.from.mockReturnValueOnce(chain({ id: "r" }));
  expect((await handler(request())).status).toBe(200);
  expect(m.queries[0]).toContainEqual(["status","pending"]);
});
