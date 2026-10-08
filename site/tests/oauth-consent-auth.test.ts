import { readFileSync } from "node:fs";
import vm from "node:vm";
import { build } from "esbuild";
import { parseHTML } from "linkedom";
import { expect, it, vi } from "vitest";

const bundle = await build({
  entryPoints: ["oauth-consent.ts"], bundle: true, format: "iife", platform: "browser", write: false,
  plugins: [{ name: "fixture-auth", setup(builder) {
    builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: "auth", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const createClient = (...args) => globalThis.fixtureClient(...args);" }));
  } }],
});

async function openConsent(search: string, signedIn = false) {
  const { window, document } = parseHTML(readFileSync(new URL("../oauth-consent.html", import.meta.url), "utf8"));
  let hasUser = signedIn;
  Object.assign(window, {
    sessionStorage: { kind: "session-storage" },
    turnstile: { render: (_root: unknown, settings: { callback: (token: string) => void }) => { settings.callback("human-token"); return "widget"; }, reset: () => {} },
  });
  const auth = {
    getUser: vi.fn(async () => ({ data: { user: hasUser ? { email: "person@example.invalid" } : null }, error: null })),
    signInWithPassword: vi.fn(async () => { hasUser = true; return { error: null }; }),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    oauth: { getAuthorizationDetails: vi.fn(async () => ({ data: { authorization_id: "request", client: { name: "ChatGPT" }, scope: "profile reports:read", redirect_uri: "https://chatgpt.com/callback" }, error: null })) },
  };
  const client = vi.fn((..._args: unknown[]) => ({ auth }));
  const location = new URL(`https://videolens.io/oauth/consent?authorization_id=request${search}`);
  const history = { replaceState: vi.fn((_state, _unused, url: URL) => { location.href = url.toString(); }) };
  const fetch = vi.fn(async (url: string) => url === "/api/config"
    ? Response.json({ supabaseUrl: "https://project.supabase.co", supabasePublishableKey: "publishable", turnstileSiteKey: "site-key" })
    : Response.json({ external: { google: true } }));
  vm.runInNewContext(bundle.outputFiles[0].text, { window, document, location, history, URL, URLSearchParams, AbortSignal, fetch, console, fixtureClient: client });
  await vi.waitFor(() => expect(document.getElementById(signedIn && !search.includes("password-reset") ? "account-choice" : "sign-in")!.hidden).toBe(false));
  return { window, document, location, history, auth, client };
}

it("keeps the alternate consent account in session storage across a social redirect", async () => {
  const f = await openConsent("&account=alternate");
  await vi.waitFor(() => expect(f.document.querySelector('[data-provider="google"]')).not.toBeNull());
  f.document.querySelector<HTMLButtonElement>('[data-provider="google"]')!.click();
  await vi.waitFor(() => expect(f.auth.signInWithOAuth).toHaveBeenCalled());
  expect(f.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "https://videolens.io/oauth/consent?authorization_id=request&account=alternate" } });
  expect(f.client.mock.calls[0][2]).toEqual({ auth: { storage: f.window.sessionStorage, storageKey: "videolens-oauth-alternate" } });
  expect(f.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled();
});

it("allows password login before binding the authorization to the chosen account", async () => {
  const f = await openConsent("");
  (f.document.getElementById("email") as HTMLInputElement).value = "person@example.invalid";
  (f.document.getElementById("password") as HTMLInputElement).value = "test-password";
  f.document.getElementById("sign-in-form")!.dispatchEvent(new f.window.Event("submit", { cancelable: true }));
  await vi.waitFor(() => expect(f.document.getElementById("account-choice")!.hidden).toBe(false));
  expect(f.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled();
  f.document.getElementById("continue-current")!.click();
  await vi.waitFor(() => expect(f.auth.oauth.getAuthorizationDetails).toHaveBeenCalledWith("request"));
});

it("opens password recovery before the consent decision and retains its authorization ID", async () => {
  const f = await openConsent("&flow=password-reset", true);
  expect(f.document.getElementById("auth-title")!.textContent).toBe("Choose your password.");
  expect(f.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled();
  (f.document.getElementById("password") as HTMLInputElement).value = "new-password";
  (f.document.getElementById("confirm-password") as HTMLInputElement).value = "new-password";
  f.document.getElementById("sign-in-form")!.dispatchEvent(new f.window.Event("submit", { cancelable: true }));
  await vi.waitFor(() => expect(f.document.getElementById("account-choice")!.hidden).toBe(false));
  expect(f.auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
  expect(f.location.href).toBe("https://videolens.io/oauth/consent?authorization_id=request");
});
