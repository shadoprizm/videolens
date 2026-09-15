import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ authenticate: vi.fn(), entitlement: vi.fn(), create: vi.fn(), single: vi.fn() }));
vi.mock("../api/_lib/auth.js", () => ({ authenticate: m.authenticate }));
vi.mock("../api/_lib/entitlements.js", () => ({ getEntitlement: m.entitlement }));
vi.mock("../api/_lib/stripe.js", () => ({ stripeClient: () => ({ checkout: { sessions: { create: m.create } } }) }));
vi.mock("../api/_lib/supabase.js", () => ({ supabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: m.single }) }) }) }) }));
import { handler } from "../api/checkout.js";
const now = new Date("2026-09-14T12:00:00Z");
const req = (billing = "monthly") => new Request("https://videolens.io/api/checkout", { method: "POST", body: JSON.stringify({ billing }) });
const gift = (expiresAt: string) => ({ canUpgrade: true, hasBillingSubscription: false, complimentary: { state: "active", expiresAt } });
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID", "price_monthly"); vi.stubEnv("STRIPE_PRO_ANNUAL_PRICE_ID", "price_annual");
  m.authenticate.mockResolvedValue({ id: "verified-user", source: "website" });
  m.entitlement.mockResolvedValue({ canUpgrade: true, hasBillingSubscription: false, complimentary: null });
  m.single.mockResolvedValue({ data: { stripe_customer_id: "cus_existing", email: "test@example.invalid" }, error: null });
  m.create.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("complimentary Pro checkout", () => {
  it.each(["monthly", "annual"])("preserves remaining free time when choosing %s", async billing => {
    m.entitlement.mockResolvedValue(gift("2026-10-01T18:00:00Z"));
    expect((await handler(req(billing))).status).toBe(200);
    expect(m.create.mock.calls[0][0]).toMatchObject({ customer: "cus_existing", client_reference_id: "verified-user", line_items: [{ price: `price_${billing}`, quantity: 1 }], subscription_data: { trial_period_days: 18, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } } });
  });
  it("preserves the final partial day with a one-day trial", async () => {
    m.entitlement.mockResolvedValue(gift("2026-09-14T18:00:00Z"));
    await handler(req()); expect(m.create.mock.calls[0][0].subscription_data.trial_period_days).toBe(1);
  });
  it.each([null, { state: "expired", expiresAt: "2026-09-13T12:00:00Z" }])("does not add a trial without a live offer", async complimentary => {
    m.entitlement.mockResolvedValue({ canUpgrade: true, hasBillingSubscription: false, complimentary });
    await handler(req()); expect(m.create.mock.calls[0][0].subscription_data).not.toHaveProperty("trial_period_days");
  });
  it("requires successful scan activation before offering paid checkout", async () => {
    m.entitlement.mockResolvedValue({ canUpgrade: false, complimentary: { state: "pending" } });
    const response = await handler(req()); expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "complimentary_scan_required" }); expect(m.create).not.toHaveBeenCalled();
  });
  it("prevents another checkout for an existing subscription", async () => {
    m.entitlement.mockResolvedValue({ canUpgrade: false, hasBillingSubscription: true, complimentary: { state: "active" } });
    expect((await handler(req())).status).toBe(409); expect(m.create).not.toHaveBeenCalled();
  });
  it("does not accept extension tokens or invalid billing periods", async () => {
    expect((await handler(req("invalid"))).status).toBe(400);
    m.authenticate.mockResolvedValue({ id: "user", source: "extension" });
    expect((await handler(req())).status).toBe(403); expect(m.create).not.toHaveBeenCalled();
  });
});
