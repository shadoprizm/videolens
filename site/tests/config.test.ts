import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ offer: vi.fn() }));
vi.mock("../api/_lib/stripe.js", async (actual) => ({ ...(await actual<typeof import("../api/_lib/stripe.js")>()), foundingOffer: m.offer }));
import { handler } from "../api/config.js";

const original = { ...process.env };
const open = { available: true, spotsLeft: 100, spots: 100, percentOff: 40, endsAt: "2027-01-01T05:00:00Z", showCount: false };

beforeEach(() => {
  m.offer.mockReset();
  m.offer.mockResolvedValue({ ...open, available: false, spotsLeft: 0 });
});

afterEach(() => {
  process.env = { ...original };
});

const config = async () => (await handler(new Request("https://videolens.io/api/config"))).json();

describe("public Pro configuration", () => {
  it("exposes only publishable account settings and plan facts", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "super-secret";
    process.env.VIDEOLENS_EXTENSION_JWT_SECRET = "jwt-secret";
    process.env.TURNSTILE_SITE_KEY = "public-turnstile-site-key";
    process.env.VERCEL = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_secret";
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_monthly";
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID = "price_annual";
    process.env.STRIPE_FOUNDING_COUPON_ID = "coupon_secret_id";

    const response = await handler(new Request("https://videolens.io/api/config"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.proAvailable).toBe(true);
    expect(body.checkoutAvailable).toBe(true);
    expect(body.turnstileSiteKey).toBe("public-turnstile-site-key");
    expect(body.plans.pro).toEqual({ managedReports: 20, monthlyPriceUsd: 12, annualPriceUsd: 99 });
    expect(JSON.stringify(body)).not.toContain("super-secret");
    expect(JSON.stringify(body)).not.toContain("sk_test_secret");
    expect(JSON.stringify(body)).not.toContain("coupon_secret_id");
  });

  it("fails closed when the account service is not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VIDEOLENS_EXTENSION_JWT_SECRET;
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.VERCEL;
    delete process.env.STRIPE_SECRET_KEY;

    const body = await config();

    expect(body.proAvailable).toBe(false);
    expect(body.checkoutAvailable).toBe(false);
    expect(body.founding).toEqual({ available: false });
  });
});

describe("public Founding Member offer", () => {
  it("publishes the discounted prices and end date, but no spot count before claims start", async () => {
    m.offer.mockResolvedValue(open);
    expect((await config()).founding).toEqual({
      available: true, percentOff: 40, spots: 100, endsAt: "2027-01-01T05:00:00Z", monthlyPriceUsd: 7.2, annualPriceUsd: 59.4,
    });
  });

  it("publishes the live spot count only once enough spots are claimed", async () => {
    m.offer.mockResolvedValue({ ...open, spotsLeft: 37, showCount: true });
    expect((await config()).founding).toMatchObject({ available: true, spotsLeft: 37 });
  });

  it("reports the offer as unavailable once it closes", async () => {
    m.offer.mockResolvedValue({ ...open, available: false, spotsLeft: 0 });
    expect((await config()).founding).toEqual({ available: false });
  });

  it("keeps the configuration available when the spot count cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    m.offer.mockRejectedValue(new Error("Missing required environment variable: SUPABASE_URL"));
    const response = await handler(new Request("https://videolens.io/api/config"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.founding).toEqual({ available: false });
    expect(body.plans.pro.monthlyPriceUsd).toBe(12);
    warn.mockRestore();
  });
});
