import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ offer: vi.fn(), rpc: vi.fn(), upsert: vi.fn(), update: vi.fn(), fetch: vi.fn() }));
vi.mock("../api/_lib/stripe.js", async (actual) => ({ ...(await actual<typeof import("../api/_lib/stripe.js")>()), foundingOffer: m.offer }));
vi.mock("../api/_lib/supabase.js", () => ({ supabaseAdmin: () => ({
  rpc: m.rpc,
  from: () => ({
    upsert: m.upsert,
    update: (values: unknown) => ({ eq: (_c: string, token: string) => ({ is: () => m.update(values, token) }) }),
  }),
}) }));
import { dueCampaigns, marketingConfig, renderCampaign, spotsLine } from "../api/_lib/marketing.js";
import { handler as send } from "../api/marketing-email.js";
import { handler as unsubscribe } from "../api/unsubscribe.js";

const open = { available: true, spotsLeft: 100, spots: 100, percentOff: 40, endsAt: "2027-01-01T05:00:00Z", showCount: false };
const cron = (secret = "cron-secret") => new Request("https://videolens.io/api/marketing-email", { headers: { authorization: `Bearer ${secret}` } });
const accepted = (id = "msg_1") => new Response(JSON.stringify({ status: "accepted", id }), { status: 200 });
const configure = (mode: string) => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("VIDEOLENS_MARKETING_MODE", mode);
  vi.stubEnv("VIDEOLENS_MARKETING_MAIL_API_KEY", "mail-key");
  vi.stubEnv("VIDEOLENS_MARKETING_MAIL_URL", "https://mail.example.invalid/send");
  vi.stubEnv("VIDEOLENS_MARKETING_FROM_EMAIL", "support@astradevs.io");
  vi.stubEnv("VIDEOLENS_MAILING_ADDRESS", "100 Example St, Ottawa ON K1A 0A1");
  vi.stubEnv("VIDEOLENS_MARKETING_TEST_RECIPIENT", "owner@example.invalid");
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", m.fetch);
  m.offer.mockResolvedValue(open);
  m.upsert.mockResolvedValue({ error: null });
  m.update.mockResolvedValue({ error: null });
  m.fetch.mockImplementation(async () => accepted());
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("campaign schedule", () => {
  it("sends only the first-report nudge once the founding offer closes", () => {
    expect(dueCampaigns({ ...open, available: false })).toEqual(["first_report_nudge"]);
  });
  it("adds the 25-left reminder and the final-week reminder only when they apply", () => {
    expect(dueCampaigns(open, new Date("2026-11-01T12:00:00Z"))).toEqual(["founding_announcement", "founding_welcome", "first_report_nudge"]);
    expect(dueCampaigns({ ...open, spotsLeft: 25 }, new Date("2026-11-01T12:00:00Z"))).toContain("founding_25_left");
    expect(dueCampaigns(open, new Date("2026-12-25T12:00:00Z"))).toContain("founding_last_week");
  });
  it("always runs the nudge last so same-run founding sends are seen first", () => {
    expect(dueCampaigns({ ...open, spotsLeft: 5 }, new Date("2026-12-28T12:00:00Z")).at(-1)).toBe("first_report_nudge");
  });
});

describe("first-report nudge content", () => {
  const nudge = renderCampaign("first_report_nudge", { spotsLeft: 0, unsubscribeToken: "11111111-2222-3333-4444-555555555555", mailingAddress: "100 <Example> St" });
  it("points to the web app first, with campaign attribution, and keeps the extension as an alternative", () => {
    expect(nudge.subject).toBe("Your 3 free VideoLens reports are waiting");
    const webApp = "https://app.videolens.io/?utm_source=email&utm_medium=email&utm_campaign=first_report_nudge";
    expect(nudge.text).toContain(webApp);
    expect(nudge.html).toContain(webApp.replaceAll("&", "&amp;"));
    expect(nudge.text.indexOf(webApp)).toBeLessThan(nudge.text.indexOf("browser extension"));
    expect(nudge.text).toContain("works on your phone");
    expect(nudge.text).toContain("https://videolens.io/account?utm_source=email&utm_medium=email&utm_campaign=first_report_nudge");
  });
  it("is not a sales email: no prices, founding offer or report pack", () => {
    for (const body of [nudge.html, nudge.text, nudge.preheader, nudge.subject]) {
      expect(body).not.toMatch(/US\$|founding|Founding|subscribe to Pro/);
    }
  });
  it("carries the same CASL footer and unsubscribe link", () => {
    expect(nudge.html).toContain("https://videolens.io/unsubscribe?token=11111111-2222-3333-4444-555555555555");
    expect(nudge.text).toContain("Unsubscribe from offer emails: https://videolens.io/unsubscribe?token=");
    expect(nudge.html).toContain("100 &lt;Example&gt; St");
    expect(nudge.html).toContain("You are receiving this because you created a VideoLens account.");
    expect(nudge.unsubscribeUrl).toBe("https://videolens.io/unsubscribe?token=11111111-2222-3333-4444-555555555555");
  });
});

describe("campaign email content", () => {
  const email = renderCampaign("founding_announcement", { spotsLeft: 37, unsubscribeToken: "11111111-2222-3333-4444-555555555555", mailingAddress: "100 <Example> St" });
  it("shows the founding prices, live spots and the report pack", () => {
    for (const part of ["US$7.20", "US$59.40", "37 of 100 founding spots left", "5 more reports for US$5"]) {
      expect(email.html).toContain(part);
      expect(email.text).toContain(part);
    }
  });
  it("shows the spot limit, never a full counter, until 10 spots are claimed", () => {
    const fresh = renderCampaign("founding_announcement", { spotsLeft: 100, unsubscribeToken: "11111111-2222-3333-4444-555555555555", mailingAddress: "x" });
    for (const body of [fresh.html, fresh.text, fresh.preheader]) {
      expect(body).toContain("Limited to the first 100 Pro members");
      expect(body).not.toMatch(/100 of 100/);
    }
    expect(spotsLine(91)).toBe("Limited to the first 100 Pro members");
    expect(spotsLine(90)).toBe("90 of 100 founding spots left");
  });
  it("includes the CASL essentials: sender, escaped mailing address and a working unsubscribe link", () => {
    expect(email.html).toContain("https://videolens.io/unsubscribe?token=11111111-2222-3333-4444-555555555555");
    expect(email.text).toContain("Unsubscribe from offer emails: https://videolens.io/unsubscribe?token=");
    expect(email.html).toContain("100 &lt;Example&gt; St");
    expect(email.html).toContain("You are receiving this because you created a VideoLens account.");
  });
  it("refuses to send without a marketing key, endpoint, sender and mailing address", () => {
    expect(() => marketingConfig()).toThrow(/VIDEOLENS_MAILING_ADDRESS/);
  });
});

describe("scheduled sender", () => {
  it("rejects calls without the cron secret", async () => {
    configure("live");
    expect((await send(cron("wrong"))).status).toBe(401);
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it("does nothing while switched off", async () => {
    configure("off");
    expect(await (await send(cron())).json()).toMatchObject({ mode: "off", sent: 0 });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("previews every due campaign to the owner only, without recording sends", async () => {
    configure("test");
    const result = await (await send(cron(), { spacingMs: 0 })).json();
    expect(result.sent).toEqual({ founding_announcement: 1, founding_welcome: 1, first_report_nudge: 1 });
    expect(m.fetch).toHaveBeenCalledTimes(3);
    const body = JSON.parse(m.fetch.mock.calls[0][1].body);
    expect(body.to).toEqual([{ email: "owner@example.invalid" }]);
    expect(body.subject).toMatch(/^\[Preview\]/);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("sends live campaigns once per member with a stable idempotency key and records each send", async () => {
    configure("live");
    m.rpc.mockImplementation(async (_fn: string, args: { p_campaign: string }) => ({ error: null, data: args.p_campaign === "founding_announcement"
      ? [{ user_id: "u1", email: "one@example.com", unsubscribe_token: "11111111-2222-3333-4444-555555555555" }]
      : [] }));
    const result = await (await send(cron(), { spacingMs: 0 })).json();
    expect(result.sent).toEqual({ founding_announcement: 1 });
    expect(m.fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe("videolens.marketing.founding_announcement.u1");
    const sentBody = JSON.parse(m.fetch.mock.calls[0][1].body);
    expect(sentBody.metadata).toEqual({ messageType: "marketing", applicationMessageId: "videolens.marketing.founding_announcement.u1" });
    expect(sentBody.headers).toEqual({ "List-Unsubscribe": "<https://videolens.io/unsubscribe?token=11111111-2222-3333-4444-555555555555>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(m.upsert).toHaveBeenCalledWith({ user_id: "u1", campaign: "founding_announcement", message_id: "msg_1" }, { onConflict: "user_id,campaign", ignoreDuplicates: true });
  });
  it("keeps sending the first-report nudge after the founding offer closes", async () => {
    configure("live");
    m.offer.mockResolvedValue({ ...open, available: false, spotsLeft: 0 });
    m.rpc.mockResolvedValue({ error: null, data: [{ user_id: "u2", email: "two@example.com", unsubscribe_token: "11111111-2222-3333-4444-555555555555" }] });
    const result = await (await send(cron(), { spacingMs: 0 })).json();
    expect(result.sent).toEqual({ first_report_nudge: 1 });
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith("marketing_candidates", expect.objectContaining({ p_campaign: "first_report_nudge" }));
    expect(m.fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe("videolens.marketing.first_report_nudge.u2");
    expect(JSON.parse(m.fetch.mock.calls[0][1].body).subject).toBe("Your 3 free VideoLens reports are waiting");
    expect(m.upsert).toHaveBeenCalledWith({ user_id: "u2", campaign: "first_report_nudge", message_id: "msg_1" }, { onConflict: "user_id,campaign", ignoreDuplicates: true });
  });
  it("stops at the first provider rejection without recording the failed send", async () => {
    configure("live");
    m.rpc.mockResolvedValue({ error: null, data: [{ user_id: "u1", email: "one@example.com", unsubscribe_token: "t" }, { user_id: "u2", email: "two@example.com", unsubscribe_token: "t" }] });
    m.fetch.mockResolvedValue(new Response(JSON.stringify({ error: "scope" }), { status: 403 }));
    expect((await send(cron(), { spacingMs: 0 })).status).toBe(502);
    expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("sends nothing when marketing email is not fully configured", async () => {
    configure("live");
    vi.stubEnv("VIDEOLENS_MAILING_ADDRESS", "");
    expect((await send(cron())).status).toBe(503);
    expect(m.fetch).not.toHaveBeenCalled();
  });
});

describe("unsubscribe", () => {
  const token = "11111111-2222-3333-4444-555555555555";
  const url = `https://videolens.io/unsubscribe?token=${token}`;
  it("asks for confirmation on GET so link scanners cannot unsubscribe people", async () => {
    const response = await unsubscribe(new Request(url));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('method="post"');
    expect(m.update).not.toHaveBeenCalled();
  });
  it("records the opt-out on POST, including one-click requests from mail clients", async () => {
    const response = await unsubscribe(new Request(url, { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(await response.text()).toContain("unsubscribed");
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ opted_out_at: expect.any(String) }), token);
  });
  it("rejects malformed tokens and never changes accounts for preview links", async () => {
    expect((await unsubscribe(new Request("https://videolens.io/unsubscribe?token=nope", { method: "POST" }))).status).toBe(400);
    expect((await unsubscribe(new Request("https://videolens.io/unsubscribe?token=preview", { method: "POST" }))).status).toBe(200);
    expect(m.update).not.toHaveBeenCalled();
  });
});
