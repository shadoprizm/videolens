import { createClient } from "@supabase/supabase-js";

type Config = { supabaseUrl: string | null; supabasePublishableKey: string | null; turnstileSiteKey: string | null };
const status = document.getElementById("status")!;
const signIn = document.getElementById("sign-in") as HTMLFormElement;
const consent = document.getElementById("consent")!;
const id = new URL(location.href).searchParams.get("authorization_id");
const signInButton = document.getElementById("sign-in-button") as HTMLButtonElement;
let captchaToken: string | null = null;
let turnstileWidgetId: string | null = null;
let turnstileRetries = 0;
let alternateAccount = false;

function setStatus(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function renderTurnstile(sitekey: string) {
  if (turnstileWidgetId) return;
  if (!window.turnstile) {
    if (turnstileRetries++ < 30) window.setTimeout(() => renderTurnstile(sitekey), 100);
    else setStatus("The human check did not load. Refresh the page and try again.", true);
    return;
  }
  turnstileRetries = 0;
  turnstileWidgetId = window.turnstile.render(document.getElementById("turnstile-container")!, {
    sitekey,
    action: "oauth_sign_in",
    theme: "light",
    callback(token) {
      captchaToken = token;
      signInButton.disabled = false;
      signInButton.textContent = "Continue";
    },
    "expired-callback"() { resetTurnstile(); },
    "error-callback"() {
      resetTurnstile();
      setStatus("The human check could not be verified. Try again.", true);
    },
  });
}

function resetTurnstile() {
  captchaToken = null;
  signInButton.disabled = true;
  signInButton.textContent = "Complete the human check";
  if (turnstileWidgetId && window.turnstile) window.turnstile.reset(turnstileWidgetId);
}

async function boot() {
  if (!id || id.length > 200) { setStatus("This connection request is invalid.", true); return; }
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) throw new Error("VideoLens account service is unavailable.");
  const config = await response.json() as Config;
  if (!config.supabaseUrl || !config.supabasePublishableKey || !config.turnstileSiteKey) throw new Error("VideoLens account service is unavailable.");
  // An alternate OAuth login stays in this consent tab's session storage.
  // It does not replace the user's normal VideoLens account session.
  const auth = (alternateAccount
    ? createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { storage: window.sessionStorage, storageKey: "videolens-oauth-alternate" },
    })
    : createClient(config.supabaseUrl, config.supabasePublishableKey)).auth;
  const { data: userData } = await auth.getUser();
  if (!userData.user) {
    setStatus("Sign in to VideoLens before deciding whether to connect this app.");
    signIn.hidden = false;
    renderTurnstile(config.turnstileSiteKey);
    signIn.addEventListener("submit", async event => {
      event.preventDefault();
      if (!captchaToken) { setStatus("Complete the human check before signing in.", true); return; }
      const email = (document.getElementById("email") as HTMLInputElement).value.trim();
      const password = (document.getElementById("password") as HTMLInputElement).value;
      signInButton.disabled = true;
      try {
        if (password) {
          const { error } = await auth.signInWithPassword({ email, password, options: { captchaToken } });
          if (error) setStatus(error.message, true);
          else void boot().catch(reason => setStatus(reason instanceof Error ? reason.message : "Could not connect VideoLens.", true));
        } else {
          const { error } = await auth.signInWithOtp({ email, options: { emailRedirectTo: location.href, captchaToken, shouldCreateUser: false } });
          setStatus(error ? error.message : "Check your email for a VideoLens sign-in link.", Boolean(error));
        }
      } finally { resetTurnstile(); }
    });
    return;
  }

  const { data, error } = await auth.oauth.getAuthorizationDetails(id);
  if (error || !data) throw new Error(error?.message || "The connection request expired. Start again from ChatGPT.");
  if (!("authorization_id" in data)) {
    location.assign(data.redirect_url);
    return;
  }
  document.getElementById("client-name")!.textContent = data.client.name;
  signIn.hidden = true;
  document.getElementById("scopes")!.textContent = data.scope || "Account access";
  document.getElementById("redirect-host")!.textContent = new URL(data.redirect_uri).host;
  setStatus(`Signed in as ${userData.user.email || "your VideoLens account"}.`);
  consent.hidden = false;
  const switchAccount = document.getElementById("switch-account") as HTMLButtonElement;
  switchAccount.hidden = alternateAccount;
  switchAccount.onclick = () => {
    alternateAccount = true;
    consent.hidden = true;
    void boot().catch(reason => setStatus(reason instanceof Error ? reason.message : "Could not switch accounts.", true));
  };
  async function decide(allow: boolean) {
    (document.getElementById("approve") as HTMLButtonElement).disabled = true;
    (document.getElementById("deny") as HTMLButtonElement).disabled = true;
    const result = allow ? await auth.oauth.approveAuthorization(id!) : await auth.oauth.denyAuthorization(id!);
    if (result.error || !result.data) {
      setStatus(result.error?.message || "Could not complete this decision.", true);
      (document.getElementById("approve") as HTMLButtonElement).disabled = false;
      (document.getElementById("deny") as HTMLButtonElement).disabled = false;
      return;
    }
    location.assign(result.data.redirect_url);
  }
  document.getElementById("approve")!.addEventListener("click", () => void decide(true));
  document.getElementById("deny")!.addEventListener("click", () => void decide(false));
}

void boot().catch(error => setStatus(error instanceof Error ? error.message : "Could not connect VideoLens.", true));
