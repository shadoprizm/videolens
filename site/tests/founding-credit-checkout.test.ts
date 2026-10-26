import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ authenticate: vi.fn(), entitlement: vi.fn(), create: vi.fn(), customer: vi.fn(), update: vi.fn(), single: vi.fn(), founding: vi.fn(), coupon: vi.fn(), pack: vi.fn() }));
vi.mock("../api/_lib/auth.js", () => ({ authenticate: m.authenticate }));
vi.mock("../api/_lib/entitlements.js", () => ({ getEntitlement: m.entitlement }));
vi.mock("../api/_lib/activation.js", () => ({ recordActivation: async () => {} }));
vi.mock("../api/_lib/stripe.js", () => ({ stripeClient: () => ({ customers: { create: m.customer }, checkout: { sessions: { create: m.create } } }), verifiedProPrice: async (billing: string) => `price_${billing}`, syncCheckout: async () => {}, foundingOffer: m.founding, verifiedFoundingCoupon: m.coupon, verifiedCreditPackPrice: m.pack }));
vi.mock("../api/_lib/supabase.js", () => ({ supabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: m.single }) }), update: () => ({ eq: m.update }) }) }) }));
import { handler } from "../api/checkout.js";
const req = (body: Record<string, unknown>) => new Request("https://videolens.io/api/checkout", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  m.authenticate.mockResolvedValue({ id: "member", source: "website" });
  m.entitlement.mockResolvedValue({ plan: "free", canUpgrade: true, hasBillingSubscription: false, complimentary: null });
  m.single.mockResolvedValue({ data: { stripe_customer_id: "cus_member", email: "member@example.invalid" }, error: null });
  m.create.mockResolvedValue({ id: "cs_member", url: "https://checkout.stripe.com/test" });
  m.customer.mockResolvedValue({ id: "cus_new" });
  m.update.mockResolvedValue({ error: null });
  m.founding.mockResolvedValue({ available: false });
  m.coupon.mockResolvedValue("videolens-founding-40");
  m.pack.mockResolvedValue("price_pack");
});
afterEach(() => vi.unstubAllEnvs());

describe("Stripe customer product labels", () => {
  it.each([{ billing: "monthly" }, { kind: "credit_pack" }])("labels new customers before creating checkout: %j", async body => {
    m.single.mockResolvedValue({ data: { stripe_customer_id: null, email: "member@example.invalid" }, error: null });
    expect((await handler(req(body))).status).toBe(200);
    expect(m.customer).toHaveBeenCalledWith({ email: "member@example.invalid", description: "VideoLens account", metadata: { user_id: "member", product: "videolens", product_name: "VideoLens" } });
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_new" }));
  });
  it("reuses an existing customer without creating a duplicate", async () => {
    expect((await handler(req({ billing: "monthly" }))).status).toBe(200);
    expect(m.customer).not.toHaveBeenCalled();
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_member" }));
  });
});

describe("Founding Member checkout", () => {
  it("applies the 40% lifetime coupon and marks the subscription while spots remain", async () => {
    m.founding.mockResolvedValue({ available: true, spotsLeft: 37 });
    expect((await handler(req({ billing: "annual" }))).status).toBe(200);
    const session = m.create.mock.calls[0][0];
    expect(session).toMatchObject({ mode: "subscription", discounts: [{ coupon: "videolens-founding-40" }], metadata: { founding_member: "true" }, subscription_data: { metadata: { user_id: "member", founding_member: "true" } } });
    expect(session).not.toHaveProperty("allow_promotion_codes");
  });
  it("charges the regular price and keeps promotion codes once the offer closes", async () => {
    await handler(req({ billing: "monthly" }));
    const session = m.create.mock.calls[0][0];
    expect(session).not.toHaveProperty("discounts");
    expect(session.allow_promotion_codes).toBe(true);
    expect(session.subscription_data.metadata).not.toHaveProperty("founding_member");
    expect(m.coupon).not.toHaveBeenCalled();
  });
  it("stops checkout rather than charging full price when the coupon fails verification", async () => {
    m.founding.mockResolvedValue({ available: true, spotsLeft: 1 });
    m.coupon.mockRejectedValue(Object.assign(new Error("mismatch"), { status: 503, code: "billing_configuration_mismatch" }));
    expect((await handler(req({ billing: "monthly" }))).status).not.toBe(200);
    expect(m.create).not.toHaveBeenCalled();
  });
});

describe("report pack checkout", () => {
  it("creates a one-time US$5 payment session marked as a VideoLens pack", async () => {
    expect((await handler(req({ kind: "credit_pack" }))).status).toBe(200);
    const session = m.create.mock.calls[0][0];
    expect(session).toMatchObject({ mode: "payment", customer: "cus_member", client_reference_id: "member", line_items: [{ price: "price_pack", quantity: 1 }], metadata: { user_id: "member", product: "videolens", kind: "credit_pack" }, payment_intent_data: { metadata: { kind: "credit_pack" } } });
    expect(session.success_url).toContain("checkout=credits");
    expect(session).not.toHaveProperty("discounts");
  });
  it("lets complimentary or free members buy packs but not paying Pro subscribers", async () => {
    m.entitlement.mockResolvedValue({ plan: "pro", hasBillingSubscription: false, complimentary: { state: "active" } });
    expect((await handler(req({ kind: "credit_pack" }))).status).toBe(200);
    m.entitlement.mockResolvedValue({ plan: "pro", hasBillingSubscription: true });
    const response = await handler(req({ kind: "credit_pack" }));
    expect(response.status).toBe(409);
    expect(m.create).toHaveBeenCalledTimes(1);
  });
  it("requires a website session and a configured pack price", async () => {
    m.authenticate.mockResolvedValue({ id: "member", source: "extension" });
    expect((await handler(req({ kind: "credit_pack" }))).status).toBe(403);
    m.authenticate.mockResolvedValue({ id: "member", source: "website" });
    m.pack.mockRejectedValue(new Error("Missing required environment variable: STRIPE_CREDIT_PACK_PRICE_ID"));
    expect((await handler(req({ kind: "credit_pack" }))).status).toBe(503);
    expect(m.create).not.toHaveBeenCalled();
  });
});
