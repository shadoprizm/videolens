import { createClient } from "@supabase/supabase-js";
import { mountAccountAuth } from "./shared/account-auth.js";

type Config = { supabaseUrl: string | null; supabasePublishableKey: string | null; turnstileSiteKey: string | null };
const status = document.getElementById("status")!;
const signIn = document.getElementById("sign-in") as HTMLElement;
const accountChoice = document.getElementById("account-choice")!;
const consent = document.getElementById("consent")!;
const id = new URL(location.href).searchParams.get("authorization_id");
let alternateAccount = new URL(location.href).searchParams.get("account") === "alternate";
let currentAccountChosen = false;
let passwordFlow = new URLSearchParams(location.hash.slice(1)).get("type") === "recovery"
  || new URL(location.href).searchParams.get("flow") === "password-reset";

function setStatus(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
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
  const redirect = new URL(location.href);
  redirect.hash = "";
  redirect.searchParams.delete("flow");
  const recoveryRedirect = new URL(redirect);
  recoveryRedirect.searchParams.set("flow", "password-reset");
  const openAuth = () => mountAccountAuth(signIn, {
    auth, supabaseUrl: config.supabaseUrl!, publishableKey: config.supabasePublishableKey!, siteKey: config.turnstileSiteKey!,
    redirectTo: redirect.toString(), recoveryRedirectTo: recoveryRedirect.toString(),
    onMessage: setStatus,
    onSignedIn: () => void boot().catch(reason => setStatus(reason instanceof Error ? reason.message : "Could not connect VideoLens.", true)),
    onPasswordUpdated: () => { passwordFlow = false; history.replaceState(null, "", redirect); void boot().catch(reason => setStatus(String(reason), true)); },
    onCancelPassword: () => { passwordFlow = false; history.replaceState(null, "", redirect); void boot().catch(reason => setStatus(String(reason), true)); },
  });
  const { data: userData } = await auth.getUser();
  if (userData.user && passwordFlow) {
    accountChoice.hidden = true;
    consent.hidden = true;
    signIn.hidden = false;
    openAuth().showPasswordUpdate();
    return;
  }
  if (!userData.user) {
    accountChoice.hidden = true;
    setStatus("Sign in to VideoLens before deciding whether to connect this app.");
    signIn.hidden = false;
    openAuth().activate();
    return;
  }

  // getAuthorizationDetails binds a pending request to the current user. Let
  // people choose their account before calling it so switching cannot strand
  // a request that was already bound to their usual VideoLens session.
  if (!alternateAccount && !currentAccountChosen) {
    setStatus("Choose the VideoLens account to connect.");
    signIn.hidden = true;
    consent.hidden = true;
    accountChoice.hidden = false;
    document.getElementById("current-email")!.textContent = userData.user.email || "your current account";
    (document.getElementById("continue-current") as HTMLButtonElement).onclick = () => {
      currentAccountChosen = true;
      accountChoice.hidden = true;
      void boot().catch(reason => setStatus(reason instanceof Error ? reason.message : "Could not connect VideoLens.", true));
    };
    (document.getElementById("use-another") as HTMLButtonElement).onclick = () => {
      alternateAccount = true;
      const alternateUrl = new URL(location.href);
      alternateUrl.searchParams.set("account", "alternate");
      history.replaceState(null, "", alternateUrl);
      accountChoice.hidden = true;
      void boot().catch(reason => setStatus(reason instanceof Error ? reason.message : "Could not switch accounts.", true));
    };
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
