import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const m = vi.hoisted(() => ({ items: vi.fn(), profile: vi.fn(), ledger: new Map<string, Record<string, unknown>>() }));
vi.mock("stripe", () => ({ default: class { checkout = { sessions: { listLineItems: m.items } }; } }));
vi.mock("../api/_lib/supabase.js", () => ({ supabaseAdmin: () => ({
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: m.profile }) }),
    upsert: async (row: Record<string, unknown>, options: { ignoreDuplicates?: boolean }) => {
      if (table !== "checkout_sessions") throw new Error("Unexpected table");
      const id = row.stripe_session_id as string;
      if (!options.ignoreDuplicates || !m.ledger.has(id)) m.ledger.set(id, row);
      return { error: null };
    },
  }),
}) }));

import { syncCheckout } from "../api/_lib/stripe.js";
import { processEvent } from "../api/stripe-webhook.js";

const session = (overrides: Record<string, unknown> = {}) => ({
  id: "cs_legacy", mode: "subscription", status: "expired", payment_status: "unpaid",
  customer: "cus_videolens", client_reference_id: "member", subscription: null,
  metadata: { user_id: "member", billing: "monthly" }, created: 1, amount_total: 1200, currency: "usd",
  ...overrides,
}) as unknown as Stripe.Checkout.Session;
const expired = (checkout: Stripe.Checkout.Session) => ({ type: "checkout.session.expired", data: { object: checkout } }) as Stripe.Event;

beforeEach(() => {
  vi.resetAllMocks(); m.ledger.clear();
  vi.stubEnv("STRIPE_SECRET_KEY", "test_fixture");
  vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID", "price_videolens_month");
  vi.stubEnv("STRIPE_PRO_ANNUAL_PRICE_ID", "price_videolens_year");
  m.profile.mockResolvedValue({ data: { user_id: "member" }, error: null });
  m.items.mockResolvedValue({ data: [{ price: { id: "price_videolens_month" } }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("checkout reporting", () => {
  it("expires a legacy checkout after verifying its customer and configured price", async () => {
    await syncCheckout(session({ status: "open" }), "member");
    await processEvent(expired(session()));
    expect(m.ledger.get("cs_legacy")).toMatchObject({ status: "expired", payment_status: "unpaid", user_id: "member" });
    expect(m.items).toHaveBeenCalledWith("cs_legacy");
  });
  it("records marked VideoLens expiry without needing legacy lookups", async () => {
    await processEvent(expired(session({ metadata: { product: "videolens", user_id: "member" } })));
    expect(m.ledger.get("cs_legacy")?.status).toBe("expired");
    expect(m.profile).not.toHaveBeenCalled();
    expect(m.items).not.toHaveBeenCalled();
  });
  it("ignores another product even when its reference matches a VideoLens member", async () => {
    await processEvent(expired(session({ metadata: { product: "other", user_id: "member" } })));
    expect(m.ledger.size).toBe(0);
    expect(m.profile).not.toHaveBeenCalled();
  });
  it("ignores a legacy checkout for an unrelated price", async () => {
    m.items.mockResolvedValue({ data: [{ price: { id: "price_other" } }] });
    await processEvent(expired(session()));
    expect(m.ledger.size).toBe(0);
  });
  it("ignores mismatched customer ownership before reading line items", async () => {
    m.profile.mockResolvedValue({ data: { user_id: "other_member" }, error: null });
    await processEvent(expired(session()));
    expect(m.ledger.size).toBe(0);
    expect(m.items).not.toHaveBeenCalled();
  });
  it("propagates lookup failures so Stripe can retry instead of losing the expiry", async () => {
    m.items.mockRejectedValue(new Error("Stripe unavailable"));
    await expect(processEvent(expired(session()))).rejects.toThrow("Stripe unavailable");
    expect(m.ledger.size).toBe(0);
  });
  it.each(["expired", "complete"])("does not reopen a %s checkout when creation is stored late", async status => {
    await syncCheckout(session({ status }), "member");
    await syncCheckout(session({ status: "open" }), "member");
    expect(m.ledger.get("cs_legacy")?.status).toBe(status);
  });
});
