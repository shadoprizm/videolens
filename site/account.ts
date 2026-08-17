import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

interface PublicConfig {
  proAvailable: boolean;
  checkoutAvailable: boolean;
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
}

interface Entitlement {
  plan: "free" | "pro";
  subscriptionStatus: string;
  managedReportsUsed: number;
  managedReportsLimit: number;
  managedReportsRemaining: number;
  periodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

interface CloudReport {
  id: string;
  title: string;
  source_type: string | null;
  mode: string | null;
  report_data: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

const loadingView = byId("loading-view");
const unavailableView = byId("unavailable-view");
const signedOutView = byId("signed-out-view");
const signedInView = byId("signed-in-view");
const message = byId("page-message");

let supabase: SupabaseClient | null = null;
let session: Session | null = null;
let config: PublicConfig | null = null;
let reports: CloudReport[] = [];

void boot();

async function boot(): Promise<void> {
  try {
    config = await fetchJson<PublicConfig>("/api/config");
    if (!config.proAvailable || !config.supabaseUrl || !config.supabasePublishableKey) {
      showOnly(unavailableView);
      return;
    }
    supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);
    supabase.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      queueMicrotask(() => void renderSession());
    });
    const { data } = await supabase.auth.getSession();
    session = data.session;
    bindEvents();
    await renderSession();
  } catch (error) {
    showOnly(unavailableView);
    setMessage(asMessage(error), "error");
  }
}

function bindEvents(): void {
  byId<HTMLFormElement>("sign-in-form").addEventListener("submit", (event) => void sendMagicLink(event));
  byId("sign-out").addEventListener("click", () => void signOut());
  byId("authorize-extension").addEventListener("click", () => void authorizeExtension());
  byId("manage-billing").addEventListener("click", () => void openPortal());
  document.querySelectorAll<HTMLButtonElement>(".checkout-button").forEach((button) => {
    button.addEventListener("click", () => void startCheckout(button.dataset.billing as "monthly" | "annual", button));
  });
  byId<HTMLInputElement>("report-search").addEventListener("input", renderReports);
}

async function renderSession(): Promise<void> {
  if (!session) {
    showOnly(signedOutView);
    showCheckoutMessage();
    return;
  }
  showOnly(signedInView);
  byId("account-email").textContent = session.user.email || "Signed in";
  await Promise.all([loadEntitlement(), loadReports()]);
  renderExtensionConnect();
  showCheckoutMessage();
}

function showOnly(view: HTMLElement): void {
  [loadingView, unavailableView, signedOutView, signedInView].forEach((candidate) => {
    candidate.hidden = candidate !== view;
  });
}

async function sendMagicLink(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!supabase) return;
  const form = event.currentTarget as HTMLFormElement;
  const button = form.querySelector<HTMLButtonElement>("button")!;
  const email = new FormData(form).get("email")?.toString().trim() || "";
  button.disabled = true;
  try {
    const redirect = new URL("/account", location.origin);
    const current = new URL(location.href);
    for (const key of ["connect", "device"]) {
      const value = current.searchParams.get(key);
      if (value) redirect.searchParams.set(key, value);
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect.toString() },
    });
    if (error) throw error;
    setMessage("Check your inbox for the secure VideoLens sign-in link.", "success");
  } catch (error) {
    setMessage(asMessage(error), "error");
  } finally {
    button.disabled = false;
  }
}

async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
  session = null;
  showOnly(signedOutView);
  setMessage("Signed out.", "success");
}

async function loadEntitlement(): Promise<void> {
  const response = await apiFetch<{ entitlement: Entitlement }>("/api/entitlement");
  const entitlement = response.entitlement;
  const isPro = entitlement.plan === "pro";
  byId("plan-name").textContent = isPro ? "VideoLens Pro" : "Free";
  byId("plan-status").textContent = isPro ? entitlement.subscriptionStatus : "Active";
  byId("usage-label").textContent = `${entitlement.managedReportsUsed} of ${entitlement.managedReportsLimit} used`;
  const percent = Math.min(100, (entitlement.managedReportsUsed / Math.max(1, entitlement.managedReportsLimit)) * 100);
  byId("usage-meter").style.width = `${percent}%`;
  byId("usage-note").textContent = isPro
    ? `${entitlement.managedReportsRemaining} remaining${entitlement.periodEndsAt ? ` until ${formatDate(entitlement.periodEndsAt)}` : " this calendar month"}.`
    : entitlement.managedReportsRemaining > 0
      ? "Your account includes one managed starter report. BYOK reports remain unlimited."
      : "Starter report used. Add Pro for 20 managed reports per calendar month, or keep using BYOK free.";
  byId("upgrade-actions").hidden = isPro;
  byId("manage-billing").hidden = !isPro;
}

function renderExtensionConnect(): void {
  const url = new URL(location.href);
  const nonce = url.searchParams.get("connect") || "";
  const deviceId = url.searchParams.get("device") || "";
  byId("extension-connect").hidden = !(nonce && deviceId);
}

async function authorizeExtension(): Promise<void> {
  const url = new URL(location.href);
  const button = byId<HTMLButtonElement>("authorize-extension");
  button.disabled = true;
  try {
    await apiFetch("/api/extension-authorize", {
      method: "POST",
      body: JSON.stringify({ nonce: url.searchParams.get("connect"), deviceId: url.searchParams.get("device") }),
    });
    button.textContent = "Connected — return to VideoLens";
    setMessage("The extension is connected to this account. You can close this tab and return to the video.", "success");
  } catch (error) {
    button.disabled = false;
    setMessage(asMessage(error), "error");
  }
}

async function startCheckout(billing: "monthly" | "annual", button: HTMLButtonElement): Promise<void> {
  if (!config?.checkoutAvailable) {
    setMessage("Checkout is not live yet. Your free starter report and BYOK mode are available now.", "error");
    return;
  }
  button.disabled = true;
  try {
    const result = await apiFetch<{ url: string }>("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ billing }),
    });
    location.href = result.url;
  } catch (error) {
    button.disabled = false;
    setMessage(asMessage(error), "error");
  }
}

async function openPortal(): Promise<void> {
  const button = byId<HTMLButtonElement>("manage-billing");
  button.disabled = true;
  try {
    const result = await apiFetch<{ url: string }>("/api/portal", { method: "POST" });
    location.href = result.url;
  } catch (error) {
    button.disabled = false;
    setMessage(asMessage(error), "error");
  }
}

async function loadReports(): Promise<void> {
  const response = await apiFetch<{ reports: CloudReport[] }>("/api/reports");
  reports = response.reports;
  renderReports();
}

function renderReports(): void {
  const root = byId("report-list");
  const empty = byId("empty-library");
  const query = byId<HTMLInputElement>("report-search").value.trim().toLowerCase();
  const visible = reports.filter((report) => {
    const summary = typeof report.report_data?.summary === "string" ? report.report_data.summary : "";
    return `${report.title} ${report.mode || ""} ${summary}`.toLowerCase().includes(query);
  });
  root.replaceChildren();
  empty.hidden = visible.length > 0;

  for (const report of visible) {
    const card = document.createElement("article");
    card.className = "report-card";
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = report.title;
    const summary = document.createElement("p");
    summary.textContent = typeof report.report_data?.summary === "string"
      ? report.report_data.summary
      : "Saved VideoLens report";
    const meta = document.createElement("div");
    meta.className = "report-meta";
    meta.textContent = `${report.mode || "Report"} · ${formatDate(report.completed_at || report.created_at)}`;
    copy.append(title, summary, meta);

    const actions = document.createElement("div");
    actions.className = "report-actions";
    const download = document.createElement("button");
    download.type = "button";
    download.textContent = "JSON";
    download.addEventListener("click", () => downloadReport(report));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => void deleteReport(report));
    actions.append(download, remove);
    card.append(copy, actions);
    root.appendChild(card);
  }
}

function downloadReport(report: CloudReport): void {
  const blob = new Blob([JSON.stringify(report.report_data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${report.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "videolens-report"}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
}

async function deleteReport(report: CloudReport): Promise<void> {
  if (!confirm(`Delete “${report.title}” from your cloud library?`)) return;
  try {
    await apiFetch(`/api/reports?id=${encodeURIComponent(report.id)}`, { method: "DELETE" });
    reports = reports.filter((candidate) => candidate.id !== report.id);
    renderReports();
    setMessage("Report deleted from the cloud library.", "success");
  } catch (error) {
    setMessage(asMessage(error), "error");
  }
}

async function apiFetch<T = Record<string, unknown>>(path: string, init: RequestInit = {}): Promise<T> {
  if (!session) throw new Error("Sign in to continue.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetchJson<T>(path, { ...init, headers });
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
  return data;
}

function showCheckoutMessage(): void {
  const checkout = new URL(location.href).searchParams.get("checkout");
  if (checkout === "success") setMessage("Payment received. Your Pro access will appear as soon as Stripe confirms the subscription.", "success");
  if (checkout === "cancelled") setMessage("Checkout was cancelled. Nothing was charged.");
}

function setMessage(text: string, kind: "success" | "error" | "info" = "info"): void {
  message.textContent = text;
  message.className = `message ${kind === "info" ? "" : kind}`.trim();
  message.hidden = false;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing account element: ${id}`);
  return element as T;
}
