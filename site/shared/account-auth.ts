import type { SupabaseClient } from "@supabase/supabase-js";

type Auth = SupabaseClient["auth"];
type Mode = "signin" | "signup" | "recover" | "magic" | "password";
const providers = ["google", "apple", "github", "facebook"] as const;
const providerNames = { google: "Google", apple: "Apple", github: "GitHub", facebook: "Facebook" };

interface Turnstile {
  render(container: HTMLElement, options: {
    sitekey: string; action: string; theme: "light"; size: "compact" | "normal";
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }): string;
  reset(widgetId?: string): void;
}
declare global { interface Window { turnstile?: Turnstile } }

export function accountRedirect(href: string): string {
  const current = new URL(href);
  const redirect = new URL("/account", current.origin);
  for (const key of ["connect", "device"]) {
    const value = current.searchParams.get(key);
    if (value) redirect.searchParams.set(key, value);
  }
  return redirect.toString();
}

export function mountAccountAuth(root: HTMLElement, options: {
  auth: Auth;
  supabaseUrl: string;
  publishableKey: string;
  siteKey: string;
  redirectTo: string;
  recoveryRedirectTo: string;
  onMessage: (message: string, error?: boolean) => void;
  onSignedIn: () => void;
  onPasswordUpdated: () => void;
  onCancelPassword: () => void;
}) {
  root.innerHTML = `
    <div id="social-sign-in" class="social-sign-in" hidden aria-label="Sign in with a provider"></div>
    <h2 id="auth-title">Sign in to VideoLens.</h2>
    <p id="auth-description">Use your email and password.</p>
    <form id="sign-in-form">
      <div id="auth-email-field"><label for="email">Email address</label>
      <input id="email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div>
      <div id="auth-password-field"><label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required></div>
      <div id="auth-confirm-field" hidden><label for="confirm-password">Confirm password</label>
      <input id="confirm-password" type="password" autocomplete="new-password"></div>
      <div id="turnstile-container" aria-live="polite"></div>
      <button id="sign-in-button" class="button button-primary" type="submit" disabled>Sign in</button>
    </form>
    <div id="auth-options" class="auth-options">
      <button type="button" data-auth-mode="signup" class="text-button">Create an account</button>
      <button type="button" data-auth-mode="recover" class="text-button">Forgot password / set a password</button>
      <button type="button" data-auth-mode="magic" class="text-button">Use an email link instead</button>
    </div>
    <button id="auth-back" type="button" class="text-button" hidden>Back to sign in</button>
    <p class="fine-print">We use your email for account access and billing, not marketing. <a href="/privacy">Privacy policy</a></p>`;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const email = get<HTMLInputElement>("email");
  const password = get<HTMLInputElement>("password");
  const confirmation = get<HTMLInputElement>("confirm-password");
  const button = get<HTMLButtonElement>("sign-in-button");
  const social = get("social-sign-in");
  let mode: Mode = "signin";
  let captchaToken: string | null = null;
  let widget: string | null = null;
  let busy = false;
  const captions: Record<Mode, string> = { signin: "Sign in", signup: "Create account", recover: "Send password reset", magic: "Send sign-in link", password: "Save password" };
  const refreshButton = () => { button.disabled = busy || (mode !== "password" && !captchaToken); button.textContent = busy ? "Please wait…" : captions[mode]; };
  const resetCaptcha = () => { captchaToken = null; if (widget && window.turnstile) window.turnstile.reset(widget); refreshButton(); };
  function setMode(next: Mode) {
    mode = next;
    password.value = "";
    confirmation.value = "";
    const needsPassword = next === "signin" || next === "signup" || next === "password";
    get("auth-email-field").hidden = next === "password";
    email.required = next !== "password";
    get("auth-password-field").hidden = !needsPassword;
    password.required = needsPassword;
    password.minLength = next === "signin" ? 0 : 8;
    password.autocomplete = next === "signin" ? "current-password" : "new-password";
    get("auth-confirm-field").hidden = next !== "signup" && next !== "password";
    confirmation.required = next === "signup" || next === "password";
    get("turnstile-container").hidden = next === "password";
    get("auth-options").hidden = next !== "signin";
    get("auth-back").hidden = next === "signin";
    social.hidden = next === "password" || !social.childElementCount;
    get("auth-title").textContent = { signin: "Sign in to VideoLens.", signup: "Create your free account.", recover: "Set or reset your password.", magic: "Sign in with an email link.", password: "Choose your password." }[next];
    get("auth-description").textContent = { signin: "Use your email and password.", signup: "Choose a password with at least 8 characters. Confirm your email once, then sign in with your password.", recover: "We’ll email a link to choose a password for your existing account. Check Spam if it doesn’t arrive.", magic: "We’ll send a one-time link. Check Spam if it doesn’t arrive.", password: "Use at least 8 characters. Future sign-ins won’t need an email link." }[next];
    refreshButton();
  }
  root.querySelectorAll<HTMLButtonElement>("[data-auth-mode]").forEach(control => control.addEventListener("click", () => setMode(control.dataset.authMode as Mode)));
  get("auth-back").addEventListener("click", () => { const wasPassword = mode === "password"; setMode("signin"); if (wasPassword) options.onCancelPassword(); });
  get<HTMLFormElement>("sign-in-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const submittedMode = mode;
    if (submittedMode !== "password" && !captchaToken) { options.onMessage("Complete the human check before continuing.", true); return; }
    if ((submittedMode === "signup" || submittedMode === "password") && (password.value.length < 8 || password.value !== confirmation.value)) {
      options.onMessage("Use at least 8 characters and enter the same password twice.", true); return;
    }
    busy = true;
    refreshButton();
    try {
      if (submittedMode === "signin") {
        const { error } = await options.auth.signInWithPassword({ email: email.value.trim(), password: password.value, options: { captchaToken: captchaToken! } });
        if (error) throw error;
        options.onSignedIn();
      } else if (submittedMode === "signup") {
        const { data, error } = await options.auth.signUp({ email: email.value.trim(), password: password.value, options: { emailRedirectTo: options.redirectTo, captchaToken: captchaToken! } });
        if (error) throw error;
        if (data.session) options.onSignedIn();
        else options.onMessage("Check your email to confirm your account once. Then sign in with your password. Check Spam if needed.");
      } else if (submittedMode === "recover") {
        const { error } = await options.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: options.recoveryRedirectTo, captchaToken: captchaToken! });
        if (error) throw error;
        options.onMessage("If this email has a VideoLens account, a password reset link is on its way. Check Spam if needed.");
      } else if (submittedMode === "magic") {
        const { error } = await options.auth.signInWithOtp({ email: email.value.trim(), options: { emailRedirectTo: options.redirectTo, captchaToken: captchaToken!, shouldCreateUser: false } });
        if (error) throw error;
        options.onMessage("Check your email for the sign-in link. Check Spam if needed.");
      } else {
        const { error } = await options.auth.updateUser({ password: password.value });
        if (error) throw error;
        setMode("signin");
        options.onPasswordUpdated();
        options.onMessage("Password saved. You can now sign in with your email and password.");
      }
    } catch (error) { options.onMessage(error instanceof Error ? error.message : "Could not sign in. Try again.", true); }
    finally { password.value = ""; confirmation.value = ""; busy = false; resetCaptcha(); }
  });
  function renderCaptcha(attempt = 0) {
    if (widget) return;
    if (!window.turnstile) {
      if (attempt < 30) window.setTimeout(() => renderCaptcha(attempt + 1), 100);
      else options.onMessage("The human check did not load. Refresh the page and try again.", true);
      return;
    }
    widget = window.turnstile.render(get("turnstile-container"), {
      sitekey: options.siteKey, action: "account_sign_in", theme: "light",
      size: window.innerWidth < 480 ? "compact" : "normal",
      callback(token) { captchaToken = token; refreshButton(); },
      "expired-callback"() { captchaToken = null; refreshButton(); },
      "error-callback"() { captchaToken = null; refreshButton(); options.onMessage("The human check could not be verified. Try again.", true); },
    });
  }
  async function loadProviders() {
    try {
      const response = await fetch(`${options.supabaseUrl}/auth/v1/settings`, { headers: { apikey: options.publishableKey }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const settings = await response.json() as { external?: Record<string, boolean> };
      for (const provider of providers.filter(provider => settings.external?.[provider] === true)) {
        const control = document.createElement("button");
        control.type = "button";
        control.className = "button button-secondary social-button";
        control.textContent = `Continue with ${providerNames[provider]}`;
        control.dataset.provider = provider;
        control.addEventListener("click", async () => {
          if (busy) return;
          busy = true;
          social.querySelectorAll<HTMLButtonElement>("button").forEach(item => { item.disabled = true; });
          refreshButton();
          try {
            const { error } = await options.auth.signInWithOAuth({ provider, options: { redirectTo: options.redirectTo, ...(provider === "github" ? { scopes: "read:user user:email" } : {}) } });
            if (error) throw error;
          } catch (error) { options.onMessage(error instanceof Error ? error.message : "Could not start sign-in. Try again.", true); }
          finally { busy = false; social.querySelectorAll<HTMLButtonElement>("button").forEach(item => { item.disabled = false; }); refreshButton(); }
        });
        social.append(control);
      }
      social.hidden = mode === "password" || !social.childElementCount;
    } catch { /* Email/password remains usable if provider discovery is unavailable. */ }
  }
  let activated = false;
  setMode("signin");
  return {
    showPasswordUpdate: () => { if (mode !== "password") setMode("password"); },
    leavePasswordUpdate: () => { if (mode === "password") setMode("signin"); },
    activate() {
      if (activated) return;
      activated = true;
      renderCaptcha();
      void loadProviders();
    },
  };
}
