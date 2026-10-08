import { parseHTML } from "linkedom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { accountRedirect, mountAccountAuth } from "../shared/account-auth.js";

afterEach(() => vi.unstubAllGlobals());

async function fixture(external: Record<string, boolean> = {}, captcha = true) {
  const { window, document } = parseHTML('<main id="auth"></main>');
  let settings: { callback: (token: string) => void; "expired-callback": () => void };
  const turnstile = {
    render: vi.fn((_root, options) => { settings = options; if (captcha) options.callback("human-token"); return "widget"; }),
    reset: vi.fn(),
  };
  Object.assign(window, { turnstile });
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ external })));
  const auth = {
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
  };
  const onMessage = vi.fn();
  const onSignedIn = vi.fn();
  const onPasswordUpdated = vi.fn();
  const controller = mountAccountAuth(document.getElementById("auth")!, {
    auth: auth as unknown as SupabaseClient["auth"],
    supabaseUrl: "https://project.supabase.co", publishableKey: "publishable", siteKey: "site-key",
    redirectTo: "https://videolens.io/account?connect=nonce&device=browser",
    recoveryRedirectTo: "https://videolens.io/account?connect=nonce&device=browser&auth=password-reset",
    onMessage, onSignedIn, onPasswordUpdated, onCancelPassword: vi.fn(),
  });
  controller.activate();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  const input = (id: string, value: string) => { (document.getElementById(id) as HTMLInputElement).value = value; };
  const submit = () => document.getElementById("sign-in-form")!.dispatchEvent(new window.Event("submit", { cancelable: true }));
  const mode = (name: string) => document.querySelector<HTMLButtonElement>(`[data-auth-mode="${name}"]`)!.click();
  input("email", "person@example.invalid");
  input("password", "test-password");
  return { auth, controller, document, input, submit, mode, onMessage, onSignedIn, onPasswordUpdated, expire: () => settings["expired-callback"]() };
}

it("uses password sign-in without sending a link and clears the password after submission", async () => {
  const f = await fixture();
  f.submit();
  await vi.waitFor(() => expect(f.onSignedIn).toHaveBeenCalledOnce());
  expect(f.auth.signInWithPassword).toHaveBeenCalledWith({ email: "person@example.invalid", password: "test-password", options: { captchaToken: "human-token" } });
  expect(f.auth.signInWithOtp).not.toHaveBeenCalled();
  expect((f.document.getElementById("password") as HTMLInputElement).value).toBe("");
});

it("creates a password account with one confirmation, preserving extension pairing", async () => {
  const f = await fixture();
  f.mode("signup");
  f.input("password", "new-password");
  f.input("confirm-password", "new-password");
  f.submit();
  await vi.waitFor(() => expect(f.onMessage).toHaveBeenCalled());
  expect(f.auth.signUp).toHaveBeenCalledWith({ email: "person@example.invalid", password: "new-password", options: { emailRedirectTo: "https://videolens.io/account?connect=nonce&device=browser", captchaToken: "human-token" } });
  expect(f.onMessage.mock.calls[0][0]).toContain("confirm your account once");
  expect(f.onSignedIn).not.toHaveBeenCalled();
});

it("requires matching passwords before creating or updating an account", async () => {
  const f = await fixture();
  f.controller.showPasswordUpdate();
  f.input("password", "new-password");
  f.input("confirm-password", "different-password");
  f.submit();
  expect(f.auth.updateUser).not.toHaveBeenCalled();
  expect(f.onMessage).toHaveBeenCalledWith(expect.stringContaining("same password twice"), true);
});

it("sends recovery to the password screen without disclosing account existence", async () => {
  const f = await fixture();
  f.mode("recover");
  f.submit();
  await vi.waitFor(() => expect(f.onMessage).toHaveBeenCalled());
  expect(f.auth.resetPasswordForEmail).toHaveBeenCalledWith("person@example.invalid", { redirectTo: "https://videolens.io/account?connect=nonce&device=browser&auth=password-reset", captchaToken: "human-token" });
  expect(f.onMessage.mock.calls[0][0]).toContain("If this email has a VideoLens account");
});

it("updates a signed-in or recovery session without another CAPTCHA or email", async () => {
  const f = await fixture({}, false);
  f.controller.showPasswordUpdate();
  f.input("password", "new-password");
  f.input("confirm-password", "new-password");
  f.submit();
  await vi.waitFor(() => expect(f.onPasswordUpdated).toHaveBeenCalledOnce());
  expect(f.auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
  expect(f.auth.signInWithOtp).not.toHaveBeenCalled();
  expect(f.document.getElementById("auth-options")!.hidden).toBe(false);
});

it("blocks password authentication when CAPTCHA is missing or expired", async () => {
  const f = await fixture();
  f.expire();
  f.submit();
  expect(f.auth.signInWithPassword).not.toHaveBeenCalled();
  expect((f.document.getElementById("sign-in-button") as HTMLButtonElement).disabled).toBe(true);
});

it("shows only enabled supported providers and preserves pairing for social sign-in", async () => {
  const f = await fixture({ google: true, apple: true, github: true, facebook: false, attacker: true });
  await vi.waitFor(() => expect(f.document.querySelectorAll("[data-provider]")).toHaveLength(3));
  f.document.querySelector<HTMLButtonElement>('[data-provider="github"]')!.click();
  await vi.waitFor(() => expect(f.auth.signInWithOAuth).toHaveBeenCalled());
  expect(f.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "github", options: { redirectTo: "https://videolens.io/account?connect=nonce&device=browser", scopes: "read:user user:email" } });
  expect(f.auth.signInWithOtp).not.toHaveBeenCalled();
});

it("keeps the legacy link as an explicit existing-account option", async () => {
  const f = await fixture();
  f.mode("magic");
  f.submit();
  await vi.waitFor(() => expect(f.auth.signInWithOtp).toHaveBeenCalled());
  expect(f.auth.signInWithOtp).toHaveBeenCalledWith({ email: "person@example.invalid", options: { emailRedirectTo: "https://videolens.io/account?connect=nonce&device=browser", captchaToken: "human-token", shouldCreateUser: false } });
});

it("constructs an account redirect using only pairing values, never a supplied destination", () => {
  expect(accountRedirect("https://videolens.io/account?connect=n&device=d&redirect_to=https://attacker.invalid#token=secret")).toBe("https://videolens.io/account?connect=n&device=d");
});
