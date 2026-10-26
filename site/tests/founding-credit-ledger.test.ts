import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
const m = vi.hoisted(() => ({ coupon: vi.fn(), price: vi.fn(), upsert: vi.fn(), count: vi.fn(), update: vi.fn(), activation: vi.fn(), checkoutUpsert: vi.fn() }));
vi.mock("stripe", () => ({ default: class { coupons = { retrieve: m.coupon }; prices = { retrieve: m.price }; } }));
vi.mock("../api/_lib/activation.js", () => ({ recordActivation: m.activation }));
vi.mock("../api/_lib/supabase.js", () => ({ supabaseAdmin: () => ({
  from: (table: string) => ({
    upsert: (...args: unknown[]) => (table === "checkout_sessions" ? m.checkoutUpsert : m.upsert)(table, ...args),
    update: () => ({ eq: m.update }),
    select: () => ({ eq: m.count }),
  }),
}) }));
import { foundingOffer, grantCreditPack, syncSubscription, verifiedCreditPackPrice, verifiedFoundingCoupon } from "../api/_lib/stripe.js";
import { processEvent } from "../api/stripe-webhook.js";
const pack = (overrides: Record<string, unknown> = {}) => ({ id: "cs_pack", mode: "payment", payment_status: "paid", status: "complete", client_reference_id: "member", amount_total: 500, currency: "usd", created: 1, metadata: { product: "videolens", kind: "credit_pack", user_id: "member" }, ...overrides }) as unknown as Stripe.Checkout.Session;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "test_fixture");
  vi.stubEnv("STRIPE_FOUNDING_COUPON_ID", "videolens-founding-40");
  vi.stubEnv("STRIPE_CREDIT_PACK_PRICE_ID", "price_pack");
  vi.stubEnv("STRIPE_PRO_PRODUCT_ID", "prod_pro");
  m.upsert.mockResolvedValue({ error: null });
  m.checkoutUpsert.mockResolvedValue({ error: null });
  m.update.mockResolvedValue({ error: null });
  m.count.mockResolvedValue({ count: 0, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("Founding Member offer window", () => {
  const before = new Date("2026-10-26T12:00:00Z");
  it("reports the remaining spots out of 100", async () => {
    m.count.mockResolvedValue({ count: 63, error: null });
    expect(await foundingOffer(before)).toMatchObject({ available: true, spotsLeft: 37, spots: 100, percentOff: 40 });
  });
  it("closes once 100 founding subscriptions exist", async () => {
    m.count.mockResolvedValue({ count: 100, error: null });
    expect(await foundingOffer(before)).toMatchObject({ available: false, spotsLeft: 0 });
  });
  it("closes at midnight Toronto at the end of 2026-12-31", async () => {
    expect((await foundingOffer(new Date("2027-01-01T04:59:59Z"))).available).toBe(true);
    expect((await foundingOffer(new Date("2027-01-01T05:00:00Z"))).available).toBe(false);
  });
  it("fails closed without a coupon or when the spot count is unavailable", async () => {
    m.count.mockResolvedValue({ count: null, error: new Error("down") });
    expect((await foundingOffer(before)).available).toBe(false);
    vi.stubEnv("STRIPE_FOUNDING_COUPON_ID", "");
    m.count.mockResolvedValue({ count: 0, error: null });
    expect((await foundingOffer(before)).available).toBe(false);
  });
});

describe("billing object verification", () => {
  it("accepts only a valid 40% forever coupon", async () => {
    m.coupon.mockResolvedValue({ valid: true, percent_off: 40, duration: "forever" });
    expect(await verifiedFoundingCoupon()).toBe("videolens-founding-40");
    m.coupon.mockResolvedValue({ valid: true, percent_off: 40, duration: "repeating" });
    await expect(verifiedFoundingCoupon()).rejects.toMatchObject({ code: "billing_configuration_mismatch" });
    m.coupon.mockRejectedValue({ type: "StripePermissionError" });
    expect(await verifiedFoundingCoupon()).toBe("videolens-founding-40");
  });
  it("accepts only an active one-time US$5 pack price", async () => {
    m.price.mockResolvedValue({ active: true, currency: "usd", unit_amount: 500, type: "one_time" });
    expect(await verifiedCreditPackPrice()).toBe("price_pack");
    m.price.mockResolvedValue({ active: true, currency: "usd", unit_amount: 500, type: "recurring" });
    await expect(verifiedCreditPackPrice()).rejects.toMatchObject({ code: "billing_configuration_mismatch" });
  });
});

describe("report pack ledger", () => {
  it("grants five reports once per paid session", async () => {
    expect(await grantCreditPack(pack())).toBe("member");
    expect(m.upsert).toHaveBeenCalledWith("report_credit_grants", expect.objectContaining({ user_id: "member", stripe_session_id: "cs_pack", credits: 5, amount_total: 500 }), { onConflict: "stripe_session_id", ignoreDuplicates: true });
  });
  it.each([
    ["unpaid", { payment_status: "unpaid" }],
    ["another product", { metadata: { product: "other", kind: "credit_pack" } }],
    ["a subscription", { mode: "subscription" }],
  ])("grants nothing for %s", async (_label, overrides) => {
    expect(await grantCreditPack(pack(overrides))).toBeNull();
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("grants on completed and async-succeeded webhooks but not on expiry", async () => {
    await processEvent({ type: "checkout.session.completed", data: { object: pack() } } as unknown as Stripe.Event);
    await processEvent({ type: "checkout.session.async_payment_succeeded", data: { object: pack() } } as unknown as Stripe.Event);
    expect(m.upsert).toHaveBeenCalledTimes(2);
    await processEvent({ type: "checkout.session.expired", data: { object: pack({ payment_status: "unpaid", status: "expired" }) } } as unknown as Stripe.Event);
    expect(m.upsert).toHaveBeenCalledTimes(2);
    expect(m.checkoutUpsert).toHaveBeenCalledTimes(3);
  });
  it("records Founding Member status from subscription metadata", async () => {
    await syncSubscription({ id: "sub", customer: "cus", metadata: { user_id: "member", founding_member: "true" }, status: "active", cancel_at_period_end: false, items: { data: [{ price: { id: "price", product: "prod_pro" } }] } } as unknown as Stripe.Subscription);
    expect(m.upsert).toHaveBeenCalledWith("subscriptions", expect.objectContaining({ founding_member: true }), { onConflict: "user_id" });
  });
});
