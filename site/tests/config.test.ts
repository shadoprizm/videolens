import { afterEach, describe, expect, it } from "vitest";
import { handler } from "../api/config.js";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("public Pro configuration", () => {
  it("exposes only publishable account settings and plan facts", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "super-secret";
    process.env.VIDEOLENS_EXTENSION_JWT_SECRET = "jwt-secret";
    process.env.VERCEL = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_secret";
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_monthly";
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID = "price_annual";

    const response = await handler(new Request("https://videolens.io/api/config"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.proAvailable).toBe(true);
    expect(body.checkoutAvailable).toBe(true);
    expect(body.plans.pro).toEqual({ managedReports: 20, monthlyPriceUsd: 12, annualPriceUsd: 99 });
    expect(JSON.stringify(body)).not.toContain("super-secret");
    expect(JSON.stringify(body)).not.toContain("sk_test_secret");
  });

  it("fails closed when the account service is not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VIDEOLENS_EXTENSION_JWT_SECRET;
    delete process.env.VERCEL;
    delete process.env.STRIPE_SECRET_KEY;

    const response = await handler(new Request("https://videolens.io/api/config"));
    const body = await response.json();

    expect(body.proAvailable).toBe(false);
    expect(body.checkoutAvailable).toBe(false);
  });
});
