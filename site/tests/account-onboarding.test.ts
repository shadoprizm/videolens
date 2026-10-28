import { readFileSync } from "node:fs";
import vm from "node:vm";
import { build } from "esbuild";
import { parseHTML } from "linkedom";
import { expect, it, vi } from "vitest";

const html = readFileSync(new URL("../account.html", import.meta.url), "utf8");
const bundle = await build({
  entryPoints: ["account.ts"], bundle: true, format: "iife", platform: "browser", write: false,
  define: { __REPORT_CSS__: '""' },
  plugins: [{ name: "fixture-auth", setup(b) {
    b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: "auth", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const createClient = () => globalThis.fixtureAuth;" }));
  } }],
});
type Offers = { founding?: { available: boolean; spotsLeft: number; showCount?: boolean }; pack?: boolean };
async function openAccount(options: { signedIn?: boolean; remaining?: number; pro?: boolean; search?: string; mobile?:boolean; purchased?: number; offers?: Offers; checkoutStatus?: { status: string; paymentStatus: string } } = {}) {
  const { window } = parseHTML(html);
  (window as unknown as { turnstile: unknown }).turnstile = {
    render: (_container: unknown, settings: { callback: (token: string) => void }) => {
      settings.callback("captcha-test-token");
      return "fixture-widget";
    },
    reset: () => {},
  };
  Object.defineProperty(window.HTMLSelectElement.prototype, "add", { configurable: true, value(option: unknown) { this.append(option); } });
  const Option = function(label: string, value: string) { const option = window.document.createElement("option"); option.textContent = label; option.value = value; return option; };
  const session = options.signedIn === false ? null : { user: { id: "member", email: "member@example.invalid" }, access_token: "fixture" };
  const purchased = options.purchased ?? 0;
  const limit = options.pro ? 20 : 3 + purchased;
  const remaining = options.remaining ?? limit;
  const offers = options.offers && {
    founding: { spots: 100, percentOff: 40, endsAt: "2027-01-01T05:00:00Z", available: false, spotsLeft: 0, ...options.offers.founding },
    creditPack: { available: Boolean(options.offers.pack), reports: 5, priceUsd: 5 },
  };
  const signInWithPassword = vi.fn(async () => ({ error: null }));
  const fetch = vi.fn(async (input: string) => {
    if (input.endsWith("/auth/v1/settings")) return Response.json({ external: {} });
    if (input === "/api/config") return Response.json({ proAvailable: true, checkoutAvailable: true, supabaseUrl: "https://example.invalid", supabasePublishableKey: "fixture", turnstileSiteKey: "public-test-key" });
    if (input === "/api/entitlement") return Response.json({ user: { isAdministrator: false }, entitlement: {
      plan: options.pro ? "pro" : "free", managedReportsRemaining: remaining,
      managedReportsUsed: limit - remaining, managedReportsLimit: limit, purchasedReports: purchased, foundingMember: false,
      canUseManagedAi: remaining > 0, canUpgrade: !options.pro, hasBillingSubscription: !!options.pro, complimentary: null,
    }, ...(offers ? { offers } : {}) });
    if (input.startsWith("/api/checkout-status?") && options.checkoutStatus) return Response.json(options.checkoutStatus);
    if (input.startsWith("/api/reports?")) return Response.json({ reports: [], nextOffset: null });
    if (input === "/api/journey") return Response.json({recorded:true});
    throw new Error(`Unexpected request ${input}`);
  });
  const url = new URL(`https://videolens.io/account${options.search || ""}`);
  vm.runInNewContext(bundle.outputFiles[0].text, {
    window, document: window.document, location: url, URL, URLSearchParams, Headers, AbortSignal, fetch, queueMicrotask, console, Option, history: { replaceState: () => {} }, setTimeout,
    navigator:{userAgent:options.mobile ? "iPhone" : "Chrome",platform:options.mobile ? "iPhone" : "Win32",maxTouchPoints:options.mobile ? 1 : 0},
    fixtureAuth: { auth: { onAuthStateChange: () => {}, getSession: async () => ({ data: { session } }), signInWithPassword,
      oauth: { listGrants: async () => ({ data: [], error: null }) } } },
    FormData: class { get() { return "member@example.invalid"; } },
  });
  const document = window.document;
  await vi.waitFor(() => expect(document.getElementById(options.signedIn === false ? "signed-out-view" : "signed-in-view")!.hidden, document.getElementById("page-message")!.textContent || "page error").toBe(false));
  if (session) await vi.waitFor(() => expect(document.getElementById("usage-note")!.textContent).not.toBe(""));
  return { document, window, fetch, signInWithPassword };
}

it("gives mobile members a desktop handoff rather than an unusable store install step",async()=>{
  const {document}=await openAccount({mobile:true});
  expect(document.getElementById("mobile-start")!.hidden).toBe(false);
  expect(document.getElementById("copy-desktop-link")!.hidden).toBe(false);
  expect(document.getElementById("desktop-install")!.hidden).toBe(true);
  expect(document.getElementById("mobile-start")!.textContent).toContain("same account");
});

it("offers the three free reports before subscription and keeps both browser installs available", async () => {
  const { document, fetch } = await openAccount();
  expect(document.getElementById("first-report-next")!.hidden).toBe(false);
  expect(document.getElementById("usage-label")!.textContent).toBe("0 of 3 used");
  expect(document.getElementById("usage-note")!.textContent).toContain("first 3 reports are free");
  expect([...document.querySelectorAll("#first-report-next a")].map(a => a.textContent)).toEqual(["Add to Chrome", "Add to Firefox", "Open the web app"]);
  expect((document.getElementById("upgrade-options") as unknown as HTMLDetailsElement).open).toBe(false);
  expect(fetch.mock.calls.some(([url]) => url.includes("checkout"))).toBe(false);
});
const order = (document: Document, id: string) => [...document.getElementById(id)!.parentElement!.children].indexOf(document.getElementById(id)!);
it("offers the no-install web app as a secondary option next to the desktop extension installs", async () => {
  const { document, fetch, window } = await openAccount();
  const option = document.getElementById("web-app-option")!;
  expect(option.hidden).toBe(false);
  expect(option.textContent).toContain("Create a report in your browser — no install");
  const link = document.getElementById("open-web-app") as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("https://app.videolens.io/?utm_source=account&utm_medium=web&utm_campaign=first_report");
  expect(link.className).toContain("button-secondary");
  expect(option.classList.contains("primary")).toBe(false);
  expect(order(document, "desktop-install")).toBeLessThan(order(document, "web-app-option"));
  link.dispatchEvent(new window.Event("click"));
  await vi.waitFor(() => expect((fetch.mock.calls as unknown as [string, RequestInit?][]).some(([url, init]) => url === "/api/journey" && String(init?.body).includes("web_app_clicked"))).toBe(true));
});
it("makes the web app the primary path on phones, ahead of the desktop handoff", async () => {
  const { document } = await openAccount({ mobile: true });
  const option = document.getElementById("web-app-option")!;
  expect(option.hidden).toBe(false);
  expect(option.classList.contains("primary")).toBe(true);
  expect(document.getElementById("open-web-app")!.className).toContain("button-primary");
  expect(document.getElementById("copy-desktop-link")!.className).toContain("button-secondary");
  expect(order(document, "web-app-option")).toBeLessThan(order(document, "copy-desktop-link"));
  expect(document.getElementById("mobile-start")!.textContent).toContain("no install needed");
});
it("hides the web app option once free reports are used", async () => {
  const { document } = await openAccount({ remaining: 0 });
  expect(document.getElementById("web-app-option")!.hidden).toBe(true);
});
it("keeps the setup path open while free reports remain", async () => {
  const { document } = await openAccount({ remaining: 2 });
  expect(document.getElementById("first-report-next")!.hidden).toBe(false);
  expect(document.getElementById("usage-label")!.textContent).toBe("1 of 3 used");
  expect(document.getElementById("usage-note")!.textContent).toContain("2 free reports left");
  expect((document.getElementById("upgrade-options") as unknown as HTMLDetailsElement).open).toBe(false);
});
it("shows Pro continuation when the starter allowance is exhausted", async () => {
  const { document } = await openAccount({ remaining: 0 });
  expect(document.getElementById("first-report-next")!.hidden).toBe(true);
  expect((document.getElementById("upgrade-options") as unknown as HTMLDetailsElement).open).toBe(true);
  expect(document.getElementById("upgrade-options")!.textContent).toContain("$12/month");
});
it("shows the Founding Member price and remaining spots while the offer is open", async () => {
  const { document } = await openAccount({ remaining: 0, offers: { founding: { available: true, spotsLeft: 37, showCount: true }, pack: true } });
  const banner = document.getElementById("founding-offer")!;
  expect(banner.hidden).toBe(false);
  expect(banner.textContent).toContain("40% off Pro for life");
  expect(banner.textContent).toContain("37 of 100 spots left");
  expect(banner.textContent).toContain("December 31, 2026");
  expect(document.getElementById("checkout-monthly")!.textContent).toBe("Continue monthly · US$7.20/month");
  expect(document.getElementById("checkout-annual")!.textContent).toBe("Choose annual · US$59.40/year");
});
it("shows the spot limit instead of a full counter until claims start", async () => {
  const { document } = await openAccount({ remaining: 0, offers: { founding: { available: true, spotsLeft: 100, showCount: false } } });
  const banner = document.getElementById("founding-offer")!;
  expect(banner.textContent).toContain("Limited to the first 100 members");
  expect(banner.textContent).not.toContain("100 of 100");
});
it("keeps regular prices when the founding offer is closed", async () => {
  const { document } = await openAccount({ remaining: 0, offers: { founding: { available: false, spotsLeft: 0 } } });
  expect(document.getElementById("founding-offer")!.hidden).toBe(true);
  expect(document.getElementById("checkout-monthly")!.textContent).toBe("Continue monthly · US$12/month");
  expect(document.getElementById("credit-pack")!.hidden).toBe(true);
});
it("offers the US$5 report pack once free reports are used", async () => {
  const { document } = await openAccount({ remaining: 0, offers: { pack: true } });
  expect(document.getElementById("credit-pack")!.hidden).toBe(false);
  expect(document.getElementById("buy-credits")!.textContent).toBe("Buy 5 reports · US$5");
  expect(document.getElementById("usage-note")!.textContent).toContain("Buy 5 more for US$5");
});
it("counts purchased reports in the allowance and says they never expire", async () => {
  const { document } = await openAccount({ purchased: 5, remaining: 6, offers: { pack: true } });
  expect(document.getElementById("usage-label")!.textContent).toBe("2 of 8 used");
  expect(document.getElementById("usage-note")!.textContent).toContain("6 reports left");
  expect(document.getElementById("usage-note")!.textContent).toContain("never expire");
});
it("confirms a paid report pack on return from checkout", async () => {
  const { document } = await openAccount({ purchased: 5, remaining: 8, offers: { pack: true }, search: "?checkout=credits&session_id=cs_fixture12345", checkoutStatus: { status: "complete", paymentStatus: "paid" } });
  await vi.waitFor(() => expect(document.getElementById("page-message")!.textContent).toContain("5 reports added"));
  expect(document.getElementById("page-message")!.textContent).toContain("8 reports left");
});
it("existing subscribers keep billing management without a free-account pitch", async () => {
  const { document } = await openAccount({ pro: true, remaining: 20 });
  expect(document.getElementById("first-report-next")!.hidden).toBe(false);
  expect((document.getElementById("report-setup") as unknown as HTMLDetailsElement).open).toBe(false);
  expect(document.getElementById("first-report-next")!.textContent).not.toContain("free report");
  expect(document.getElementById("upgrade-options")!.hidden).toBe(true);
  expect(document.getElementById("manage-billing")!.hidden).toBe(false);
});
it("paid mobile members can still move to their desktop and find the extension",async()=>{
  const {document}=await openAccount({mobile:true,pro:true,remaining:20});
  expect(document.getElementById("first-report-next")!.hidden).toBe(false);
  expect((document.getElementById("report-setup") as unknown as HTMLDetailsElement).open).toBe(true);
  expect(document.getElementById("copy-desktop-link")!.hidden).toBe(false);
  expect(document.getElementById("desktop-install")!.hidden).toBe(true);
  expect(document.getElementById("report-setup-kicker")!.textContent).toBe("Your desktop workspace");
});
it("a pairing link prioritizes connecting the installed extension", async () => {
  const { document } = await openAccount({ search: "?connect=nonce&device=device" });
  await vi.waitFor(() => expect(document.getElementById("extension-connect")!.hidden).toBe(false));
  expect(document.getElementById("first-report-next")!.hidden).toBe(true);
  expect(document.getElementById("connect-title")!.textContent).toBe("Connect this browser to your account?");
  expect(document.getElementById("authorize-extension")!.textContent).toBe("Connect extension");
});
it("a web app pairing link says it is connecting the VideoLens web app", async () => {
  const { document } = await openAccount({ search: "?connect=nonce&device=web-device&client=web" });
  await vi.waitFor(() => expect(document.getElementById("extension-connect")!.hidden).toBe(false));
  expect(document.getElementById("connect-kicker")!.textContent).toBe("Web app connection");
  expect(document.getElementById("connect-title")!.textContent).toBe("Connect the VideoLens web app to your account?");
  expect(document.getElementById("connect-description")!.textContent).not.toContain("extension");
  expect(document.getElementById("authorize-extension")!.textContent).toBe("Connect web app");
});
it("password sign-in does not request an email or create checkout during pairing", async () => {
  const { document, window, signInWithPassword, fetch } = await openAccount({ signedIn: false, search: "?connect=nonce&device=device" });
  (document.getElementById("email") as HTMLInputElement).value = "member@example.invalid";
  (document.getElementById("password") as HTMLInputElement).value = "test-password";
  document.getElementById("sign-in-form")!.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await vi.waitFor(() => expect(signInWithPassword).toHaveBeenCalled());
  expect(signInWithPassword.mock.calls[0]).toEqual([{ email: "member@example.invalid", password: "test-password", options: { captchaToken: "captcha-test-token" } }]);
  expect(fetch.mock.calls.some(([url]) => url.includes("checkout"))).toBe(false);
});
