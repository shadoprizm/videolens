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
async function openAccount(options: { signedIn?: boolean; remaining?: number; pro?: boolean; search?: string } = {}) {
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
  const remaining = options.remaining ?? 1;
  const signInWithPassword = vi.fn(async () => ({ error: null }));
  const fetch = vi.fn(async (input: string) => {
    if (input.endsWith("/auth/v1/settings")) return Response.json({ external: {} });
    if (input === "/api/config") return Response.json({ proAvailable: true, checkoutAvailable: true, supabaseUrl: "https://example.invalid", supabasePublishableKey: "fixture", turnstileSiteKey: "public-test-key" });
    if (input === "/api/entitlement") return Response.json({ user: { isAdministrator: false }, entitlement: {
      plan: options.pro ? "pro" : "free", managedReportsRemaining: remaining,
      managedReportsUsed: 1 - remaining, managedReportsLimit: options.pro ? 20 : 1,
      canUseManagedAi: remaining > 0, canUpgrade: !options.pro, hasBillingSubscription: !!options.pro, complimentary: null,
    } });
    if (input.startsWith("/api/reports?")) return Response.json({ reports: [], nextOffset: null });
    throw new Error(`Unexpected request ${input}`);
  });
  const url = new URL(`https://videolens.io/account${options.search || ""}`);
  vm.runInNewContext(bundle.outputFiles[0].text, {
    window, document: window.document, location: url, URL, URLSearchParams, Headers, AbortSignal, fetch, queueMicrotask, console, Option,
    fixtureAuth: { auth: { onAuthStateChange: () => {}, getSession: async () => ({ data: { session } }), signInWithPassword,
      oauth: { listGrants: async () => ({ data: [], error: null }) } } },
    FormData: class { get() { return "member@example.invalid"; } },
  });
  const document = window.document;
  await vi.waitFor(() => expect(document.getElementById(options.signedIn === false ? "signed-out-view" : "signed-in-view")!.hidden, document.getElementById("page-message")!.textContent || "page error").toBe(false));
  if (session) await vi.waitFor(() => expect(document.getElementById("usage-note")!.textContent).not.toBe(""));
  return { document, window, fetch, signInWithPassword };
}

it("offers the free report before subscription and keeps both browser installs available", async () => {
  const { document, fetch } = await openAccount();
  expect(document.getElementById("first-report-next")!.hidden).toBe(false);
  expect([...document.querySelectorAll("#first-report-next a")].map(a => a.textContent)).toEqual(["Add to Chrome", "Add to Firefox"]);
  expect((document.getElementById("upgrade-options") as unknown as HTMLDetailsElement).open).toBe(false);
  expect(fetch.mock.calls.some(([url]) => url.includes("checkout"))).toBe(false);
});
it("shows Pro continuation when the starter allowance is exhausted", async () => {
  const { document } = await openAccount({ remaining: 0 });
  expect(document.getElementById("first-report-next")!.hidden).toBe(true);
  expect((document.getElementById("upgrade-options") as unknown as HTMLDetailsElement).open).toBe(true);
  expect(document.getElementById("upgrade-options")!.textContent).toContain("$12/month");
});
it("existing subscribers keep billing management without a free-account pitch", async () => {
  const { document } = await openAccount({ pro: true, remaining: 20 });
  expect(document.getElementById("first-report-next")!.hidden).toBe(true);
  expect(document.getElementById("upgrade-options")!.hidden).toBe(true);
  expect(document.getElementById("manage-billing")!.hidden).toBe(false);
});
it("a pairing link prioritizes connecting the installed extension", async () => {
  const { document } = await openAccount({ search: "?connect=nonce&device=device" });
  await vi.waitFor(() => expect(document.getElementById("extension-connect")!.hidden).toBe(false));
  expect(document.getElementById("first-report-next")!.hidden).toBe(true);
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
