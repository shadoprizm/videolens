import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ upsert: vi.fn(), record: vi.fn(), update: vi.fn() }));
vi.mock("../api/_lib/supabase.js", () => ({ supabaseAdmin: () => ({ from: () => ({ upsert: m.upsert, update: () => ({ eq: m.update }) }) }) }));
vi.mock("../api/_lib/activation.js", () => ({ recordActivation: m.record }));
import { syncSubscription } from "../api/_lib/stripe.js";
import type Stripe from "stripe";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("STRIPE_PRO_PRODUCT_ID", "prod_pro"); m.upsert.mockResolvedValue({ error: null }); m.update.mockResolvedValue({ error: null }); });
afterEach(() => vi.unstubAllEnvs());
it.each([ ["active", "prod_pro", true], ["trialing", "prod_pro", false], ["incomplete", "prod_pro", false], ["canceled", "prod_pro", false], ["active", "prod_unrelated", false] ])("records active Pro only for confirmed correct subscription: %s %s", async (status, product, expected) => {
  await syncSubscription({ id: "sub_test", customer: "cus_test", metadata: { user_id: "member" }, status, cancel_at_period_end: false, items: { data: [{ price: { id: "price", product }, current_period_start: 100, current_period_end: 200 }] } } as unknown as Stripe.Subscription);
  expect(m.upsert).toHaveBeenCalled();
  expect(m.record.mock.calls.length).toBe(expected ? 1 : 0);
  if (expected) expect(m.record).toHaveBeenCalledWith("member", "subscription_active", "sub_test");
});
it("never records activation if entitlement persistence fails", async () => {
  m.upsert.mockResolvedValue({ error: new Error("unavailable") });
  await expect(syncSubscription({ id: "sub", customer: "cus", metadata: { user_id: "member" }, status: "active", items: { data: [{ price: { product: "prod_pro" } }] } } as unknown as Stripe.Subscription)).rejects.toThrow();
  expect(m.record).not.toHaveBeenCalled();
});
