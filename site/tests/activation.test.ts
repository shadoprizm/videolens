import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ insert: vi.fn(), abort: vi.fn(), getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("../api/_lib/supabase.js", () => ({ supabaseAdmin: () => ({ from: () => ({ insert: m.insert }), auth: { getUser: m.getUser }, rpc: m.rpc }) }));
import { recordActivation } from "../api/_lib/activation.js";
import { handler } from "../api/admin.js";
beforeEach(() => { vi.resetAllMocks(); m.insert.mockReturnValue({ abortSignal: m.abort }); m.abort.mockResolvedValue({ error: null }); });
describe("content-free activation milestones", () => {
  it("writes only identity, fixed event and a hash, never payment payloads", async () => {
    await recordActivation("user", "checkout_started", "cs_sensitive-session");
    expect(m.insert.mock.calls[0][0]).toEqual({ user_id: "user", event: "checkout_started", event_key: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(m.insert.mock.calls)).not.toContain("cs_sensitive");
  });
  it("never blocks account connection or checkout on telemetry failure", async () => {
    m.abort.mockRejectedValue(new Error("private data must not be logged"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordActivation("user", "account_connected", "nonce")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("Activation milestone unavailable"); warn.mockRestore();
  });
  it("requires the administrator session before querying aggregates", async () => {
    m.getUser.mockResolvedValue({ data: { user: { email: "member@example.invalid", email_confirmed_at: "today" } } });
    const request = () => new Request("https://videolens.io/api/admin?view=funnel", { headers: { Authorization: "Bearer valid" } });
    expect((await handler(request())).status).toBe(403); expect(m.rpc).not.toHaveBeenCalled();
    m.getUser.mockResolvedValue({ data: { user: { email: "ratelle.ja@gmail.com", email_confirmed_at: "today" } } });
    m.rpc.mockResolvedValue({ data: { events: [] }, error: null });
    expect((await handler(request())).status).toBe(200); expect(m.rpc).toHaveBeenCalledWith("activation_funnel");
  });
});
