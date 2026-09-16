import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("../api/_lib/supabase.js", () => ({ supabaseAdmin: () => ({ auth: { getUser: mocked.getUser }, rpc: mocked.rpc }) }));
import { handler } from "../api/admin.js";
import { isAdministrator } from "../api/_lib/admin.js";

const admin = { id: "admin", email: "ratelle.ja@gmail.com", email_confirmed_at: "2026-09-13" };
function request(query = "", token: string | null = "valid-session") {
  return new Request(`https://videolens.io/api/admin${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}
beforeEach(() => { vi.resetAllMocks(); mocked.getUser.mockResolvedValue({ data: { user: admin }, error: null }); mocked.rpc.mockResolvedValue({ data: { members: [], summary: { members: 0 } }, error: null }); });
describe("administrator boundary", () => {
  it("requires a verified exact email, without trusting user-editable metadata", () => {
    expect(isAdministrator(admin)).toBe(true);
    expect(isAdministrator({ ...admin, email: " RATELLE.JA@GMAIL.COM " })).toBe(true);
    expect(isAdministrator({ ...admin, email_confirmed_at: undefined })).toBe(false);
    expect(isAdministrator({ ...admin, email: "ratelle.ja+other@gmail.com" })).toBe(false);
    expect(isAdministrator({ ...admin, email: "someone@example.com" })).toBe(false);
  });
  it("rejects requests without credentials before accessing any data", async () => {
    expect((await handler(request("", null))).status).toBe(401);
    expect(mocked.getUser).not.toHaveBeenCalled(); expect(mocked.rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid and extension tokens through Supabase Auth", async () => {
    mocked.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid token") });
    expect((await handler(request("", "extension-token"))).status).toBe(401);
    expect(mocked.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { ...admin, email: "member@example.com", user_metadata: { role: "admin", email: admin.email } },
    { ...admin, email_confirmed_at: undefined },
  ])("blocks non-administrators and unverified accounts", async user => {
    mocked.getUser.mockResolvedValue({ data: { user }, error: null });
    expect((await handler(request())).status).toBe(403); expect(mocked.rpc).not.toHaveBeenCalled();
  });
  it("validates the live session on every request and never caches membership data", async () => {
    const result = await handler(request("?q=alice&membership=paid&page=2&activityPage=3&userId=00000000-0000-0000-0000-000000000001"));
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    expect(mocked.rpc).toHaveBeenCalledWith("administrator_dashboard", { p_query: "alice", p_membership: "paid", p_page: 2, p_activity_page: 3, p_user_id: "00000000-0000-0000-0000-000000000001" });
    mocked.getUser.mockResolvedValue({ data: { user: { ...admin, email: "member@example.com" } }, error: null });
    expect((await handler(request())).status).toBe(403); expect(mocked.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["?page=0", "?page=-1", "?page=1.5", "?page=100001", "?activityPage=foo", "?membership=admin", "?userId=not-a-uuid"])("rejects invalid input: %s", async query => {
    expect((await handler(request(query))).status).toBe(400); expect(mocked.rpc).not.toHaveBeenCalled();
  });
  it("does not expose database errors", async () => {
    mocked.rpc.mockResolvedValue({ data: null, error: new Error("private database detail") });
    const result = await handler(request()); expect(result.status).toBe(500); expect(await result.text()).not.toContain("private database detail");
  });
  it("does not allow writes", async () => {
    expect((await handler(new Request("https://videolens.io/api/admin", { method: "POST" }))).status).toBe(405);
    expect(mocked.rpc).not.toHaveBeenCalled();
  });
});
