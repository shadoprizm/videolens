import { createClient } from "@supabase/supabase-js";

type Config = { supabaseUrl: string | null; supabasePublishableKey: string | null };
const status = document.getElementById("status")!;
const signIn = document.getElementById("sign-in") as HTMLFormElement;
const consent = document.getElementById("consent")!;
const id = new URL(location.href).searchParams.get("authorization_id");

function setStatus(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

async function boot() {
  if (!id || id.length > 200) { setStatus("This connection request is invalid.", true); return; }
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) throw new Error("VideoLens account service is unavailable.");
  const config = await response.json() as Config;
  if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error("VideoLens account service is unavailable.");
  const auth = createClient(config.supabaseUrl, config.supabasePublishableKey).auth;
  const { data: userData } = await auth.getUser();
  if (!userData.user) {
    setStatus("Sign in to VideoLens before deciding whether to connect this app.");
    signIn.hidden = false;
    signIn.addEventListener("submit", async event => {
      event.preventDefault();
      const email = (document.getElementById("email") as HTMLInputElement).value.trim();
      const password = (document.getElementById("password") as HTMLInputElement).value;
      if (password) {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) setStatus(error.message, true);
        else void boot().catch(reason => setStatus(reason instanceof Error ? reason.message : "Could not connect VideoLens.", true));
      } else {
        const { error } = await auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
        setStatus(error ? error.message : "Check your email for a VideoLens sign-in link.", Boolean(error));
      }
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
