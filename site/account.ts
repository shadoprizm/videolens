import { bindLessonStudy } from "./shared/lessonStudy.js";
import { checkoutReady } from "./checkout-return.js";
import { accountRedirect, mountAccountAuth } from "./shared/account-auth.js";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { reportBody, reportDate, reportFilename, reportHtml, reportJson, reportMarkdown, reportMode, reportSearchText, reportTitle, type CloudReport } from "./cloud-report.js";
import type { JourneyEvent } from "./shared/journey.js";

declare const __REPORT_CSS__: string;

interface PublicConfig {
  proAvailable: boolean;
  checkoutAvailable: boolean;
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  turnstileSiteKey: string | null;
}

import type { Entitlement } from "./api/_lib/entitlements.js";

interface Offers {
  founding: { available: boolean; spotsLeft: number; spots: number; percentOff: number; endsAt: string };
  creditPack: { available: boolean; reports: number; priceUsd: number };
}

const loadingView = byId("loading-view");
const unavailableView = byId("unavailable-view");
const signedOutView = byId("signed-out-view");
const signedInView = byId("signed-in-view");
const message = byId("page-message");

let supabase: SupabaseClient | null = null;
let session: Session | null = null;
let config: PublicConfig | null = null;
let currentEntitlement: Entitlement | null = null;
let currentOffers: Offers | null = null;
let checkoutPolling = false;
let renderSequence = 0;
let reports: CloudReport[] = [];
let reportSearch = new Map<string, string>();
let activeReport: CloudReport | null = null;
let passwordFlow = new URLSearchParams(location.hash.slice(1)).get("type") === "recovery";
let authUi: ReturnType<typeof mountAccountAuth>;
const reader = byId<HTMLDialogElement>("report-reader");

void boot();

async function boot(): Promise<void> {
  try {
    const callbackError = new URLSearchParams(location.hash.slice(1)).get("error_description");
    if (callbackError) setMessage(callbackError, "error");
    config = await fetchJson<PublicConfig>("/api/config");
    if (!config.proAvailable || !config.supabaseUrl || !config.supabasePublishableKey) {
      showOnly(unavailableView);
      return;
    }
    supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);
    supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") passwordFlow = true;
      session = nextSession;
      queueMicrotask(() => void renderSession());
    });
    const recoveryRedirect = new URL(accountRedirect(location.href));
    recoveryRedirect.searchParams.set("auth", "password-reset");
    authUi = mountAccountAuth(byId("account-auth"), {
      auth: supabase.auth, supabaseUrl: config.supabaseUrl, publishableKey: config.supabasePublishableKey, siteKey: config.turnstileSiteKey!,
      redirectTo: accountRedirect(location.href), recoveryRedirectTo: recoveryRedirect.toString(),
      onMessage: (text, error) => setMessage(text, error ? "error" : "success"),
      onSignedIn: () => void renderSession(),
      onPasswordUpdated: () => { passwordFlow = false; void renderSession(); },
      onCancelPassword: () => { passwordFlow = false; void renderSession(); },
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
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  byId("mobile-start").hidden = !mobile;
  byId("copy-desktop-link").hidden = !mobile;
  byId("desktop-start").hidden = mobile;
  byId("desktop-install").hidden = mobile;
  byId("copy-desktop-link").addEventListener("click", () => {
    void navigator.clipboard.writeText("https://videolens.io/account").then(() => { trackJourney("desktop_link_copied"); setMessage("Link copied. Open it on your computer and sign in to the same account.", "success"); }).catch(() => setMessage("Open https://videolens.io/account on your computer and sign in with this account."));
  });
  byId("install-chrome").addEventListener("click", () => trackJourney("install_chrome_clicked"));
  byId("install-firefox").addEventListener("click", () => trackJourney("install_firefox_clicked"));
  byId<HTMLDetailsElement>("upgrade-options").addEventListener("toggle", () => { if (byId<HTMLDetailsElement>("upgrade-options").open) trackJourney("pricing_viewed"); });
  byId("set-password").addEventListener("click", () => { passwordFlow = true; void renderSession(); });
  byId("sign-out").addEventListener("click", () => void signOut());
  byId("authorize-extension").addEventListener("click", () => void authorizeExtension());
  byId("refresh-access").addEventListener("click", () => void renderSession());
  byId("manage-billing").addEventListener("click", () => void openPortal());
  document.querySelectorAll<HTMLButtonElement>(".checkout-button").forEach((button) => {
    button.addEventListener("click", () => void startCheckout(button.dataset.billing as "monthly" | "annual", button));
  });
  byId<HTMLButtonElement>("buy-credits").addEventListener("click", (event) => void startCreditCheckout(event.currentTarget as HTMLButtonElement));
  byId<HTMLInputElement>("report-search").addEventListener("input", renderReports);
  byId("close-report").addEventListener("click", () => reader.close());
  reader.addEventListener("close", () => {
    activeReport = null;
    byId("reader-content").replaceChildren();
    document.body.classList.remove("reading-report");
    if (location.hash.startsWith("#report=")) history.replaceState(null, "", location.pathname + location.search);
  });
  window.addEventListener("hashchange", openLinkedReport);
  byId("reader-actions").append(exportMenu(() => activeReport));
}

async function renderSession(): Promise<void> {
  const sequence = ++renderSequence;
  if (session && passwordFlow) {
    showOnly(signedOutView);
    authUi.showPasswordUpdate();
    return;
  }
  if (!session) {
    passwordFlow = false;
    authUi.leavePasswordUpdate();
    currentEntitlement = null;
    if (reader.open) reader.close();
    reports = [];
    reportSearch.clear();
    byId("report-list").replaceChildren();
    showOnly(signedOutView);
    authUi.activate();
    showCheckoutMessage();
    return;
  }
  showOnly(signedInView);
  byId("account-email").textContent = session.user.email || "Signed in";
  try {
    await Promise.all([loadEntitlement(), loadReports(), loadConnectedApps()]);
    if (sequence !== renderSequence) return;
    trackJourney("account_opened");
    renderExtensionConnect();
    showCheckoutMessage();
    void confirmCheckout();
    void confirmCreditPack();
  } catch (error) { if (sequence === renderSequence) setMessage(asMessage(error), "error"); }
}

async function loadConnectedApps(): Promise<void> {
  if (!supabase) return;
  const section = byId("connected-apps");
  const list = byId("connected-app-list");
  const { data, error } = await supabase.auth.oauth.listGrants();
  if (error || !data?.length) { section.hidden = true; return; }
  list.replaceChildren();
  for (const grant of data) {
    const row = document.createElement("div");
    row.className = "mode-row";
    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = grant.client.name;
    const scopes = document.createElement("p");
    scopes.textContent = `Granted: ${grant.scopes.join(", ") || "account access"}`;
    details.append(name, scopes);
    const revoke = document.createElement("button");
    revoke.type = "button";
    revoke.className = "button button-secondary";
    revoke.textContent = "Remove access";
    revoke.addEventListener("click", async () => {
      if (!confirm(`Remove ${grant.client.name}'s access to your VideoLens account?`)) return;
      revoke.disabled = true;
      const result = await supabase!.auth.oauth.revokeGrant({ clientId: grant.client.id });
      if (result.error) { setMessage(result.error.message, "error"); revoke.disabled = false; return; }
      await loadConnectedApps();
      setMessage(`${grant.client.name} access removed.`, "success");
    });
    row.append(details, revoke);
    list.append(row);
  }
  section.hidden = false;
}

function showOnly(view: HTMLElement): void {
  byId("account-title").textContent = view === signedInView ? "Your VideoLens account." : "Your first three reports are on us.";
  byId("account-intro").textContent = view === signedInView
    ? "Create reports, lessons, and guides. Manage your allowance, subscription, and saved reports here."
    : "Turn videos into reports, lessons, and step-by-step guides. Create a free account—no API key or credit card required.";
  [loadingView, unavailableView, signedOutView, signedInView].forEach((candidate) => {
    candidate.hidden = candidate !== view;
  });
}

async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
  session = null;
  passwordFlow = false;
  showOnly(signedOutView);
  setMessage("Signed out.", "success");
}

async function loadEntitlement(): Promise<void> {
  const accountId = session?.user.id;
  const response = await apiFetch<{ entitlement: Entitlement; user: { isAdministrator: boolean }; offers?: Offers }>("/api/entitlement");
  if (!session || session.user.id !== accountId) return;
  const entitlement = response.entitlement;
  currentEntitlement = entitlement;
  currentOffers = response.offers || null;
  const isPro = entitlement.plan === "pro";
  const purchased = entitlement.purchasedReports || 0;
  const remaining = entitlement.managedReportsRemaining;
  const packAvailable = Boolean(currentOffers?.creditPack.available);
  byId("plan-name").textContent = isPro ? "VideoLens Pro" : "Free";
  byId("plan-status").textContent = isPro ? (entitlement.foundingMember && entitlement.hasBillingSubscription ? `Founding Member · ${entitlement.subscriptionStatus}` : entitlement.subscriptionStatus) : "Active";
  byId("usage-label").textContent = `${entitlement.managedReportsUsed} of ${entitlement.managedReportsLimit} used`;
  const percent = Math.min(100, (entitlement.managedReportsUsed / Math.max(1, entitlement.managedReportsLimit)) * 100);
  byId("usage-meter").style.width = `${percent}%`;
  byId("usage-note").textContent = isPro
    ? `${remaining} remaining${entitlement.periodEndsAt ? ` until ${formatDate(entitlement.periodEndsAt)}` : " this calendar month"}.`
    : remaining === entitlement.managedReportsLimit && purchased === 0
      ? `Your first ${entitlement.managedReportsLimit} reports are free. Connect the browser extension to create them—no API key required.`
      : remaining > 0
        ? purchased > 0
          ? `${remaining} ${remaining === 1 ? "report" : "reports"} left, including reports you purchased. Purchased reports never expire.`
          : `${remaining} free ${remaining === 1 ? "report" : "reports"} left. Connect the browser extension to keep going—no API key required.`
        : packAvailable
          ? "Your reports are used. Buy 5 more for US$5, or continue with Pro for 20 reports per calendar month. Your saved reports remain available."
          : "Your free reports are used. Continue with Pro for 20 reports per calendar month. Your saved reports remain available.";
  renderOffers(entitlement);
  const hasStarter = !isPro && entitlement.canUseManagedAi && entitlement.managedReportsRemaining > 0;
  const pairing = new URL(location.href).searchParams;
  byId("first-report-next").hidden = !(hasStarter || isPro) || Boolean(pairing.get("connect") && pairing.get("device"));
  byId("report-setup-kicker").textContent = isPro ? "Your desktop workspace" : "Your free reports are ready to create";
  byId("report-setup-title").textContent = isPro ? "Create reports on your computer" : "Open a video. Make something useful.";
  byId<HTMLDetailsElement>("report-setup").open = !isPro || !byId("mobile-start").hidden;
  byId("desktop-start").textContent = `1. Add the extension below. 2. Open VideoLens → Settings → Connect account, and approve the connection here. 3. Choose a YouTube video or local video file and create ${isPro ? "a report" : "a free report"}.`;
  byId("upgrade-options").hidden = !entitlement.canUpgrade;
  byId<HTMLDetailsElement>("upgrade-options").open = entitlement.canUpgrade && !hasStarter;
  byId("upgrade-summary").textContent = hasStarter ? "Explore Pro after your free reports" : "Keep creating with VideoLens Pro";
  byId("upgrade-actions").hidden = !entitlement.canUpgrade;
  byId("manage-billing").hidden = !entitlement.hasBillingSubscription || response.user.isAdministrator;
  const offer = entitlement.complimentary;
  const offerNote = byId("complimentary-note");
  offerNote.hidden = !offer;
  if (offer?.state === "pending") {
    offerNote.textContent = "Your complimentary month is ready. Complete your next successful managed scan to unlock 30 days of Pro and 20 additional managed reports. No card required. You can choose a paid plan after activation.";
  } else if (offer?.state === "active") {
    offerNote.textContent = entitlement.hasBillingSubscription
      ? `Your complimentary access lasts until ${formatDate(offer.expiresAt!)}. ${entitlement.billingStartsAt ? `Your selected paid plan starts billing ${formatDate(entitlement.billingStartsAt)}. Manage or cancel it below.` : "Your paid subscription is managed separately below."}`
      : `Complimentary Pro ends ${formatDate(offer.expiresAt!)}. No charge: your account returns to Free and your saved reports remain available. Choose a paid plan below to continue; billing will start after your complimentary access (the date is shown at checkout).`;
    if (!entitlement.hasBillingSubscription) byId("plan-status").textContent = "Complimentary Pro";
  } else if (offer?.state === "expired") {
    offerNote.textContent = entitlement.hasBillingSubscription
      ? "Your complimentary month has ended. Your selected subscription is managed below."
      : "Your complimentary month has ended. Your account and saved reports remain available. Choose Pro below to continue managed scanning, or use Private mode with your own key.";
  }
  byId("admin-link").hidden = !response.user.isAdministrator;
  if (response.user.isAdministrator) byId("plan-status").textContent = "Administrator · permanent Pro";
}

const money = (cents: number) => `US$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

function renderOffers(entitlement: Entitlement): void {
  const founding = currentOffers?.founding;
  const open = Boolean(founding?.available && entitlement.canUpgrade);
  const factor = open ? (100 - founding!.percentOff) / 100 : 1;
  const monthly = money(Math.round(1200 * factor)), annual = money(Math.round(9900 * factor));
  const banner = byId("founding-offer");
  banner.hidden = !open;
  if (open) {
    // endsAt is the exclusive close instant; show the last day the offer is open.
    const lastDay = new Date(Date.parse(founding!.endsAt) - 1).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Toronto" });
    banner.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = `Founding Member: ${founding!.percentOff}% off Pro for life.`;
    banner.append(title, ` ${monthly}/month or ${annual}/year for as long as you stay subscribed. ${founding!.spotsLeft} of ${founding!.spots} spots left; offer ends ${lastDay}.`);
  }
  byId("checkout-monthly").textContent = `Continue monthly · ${monthly}/month`;
  byId("checkout-annual").textContent = `Choose annual · ${annual}/year`;
  byId("checkout-fine-print").textContent = open
    ? `Your founding price is applied at checkout and kept while your subscription stays active. Monthly renews each month; annual charges ${annual} each year. Cancel future renewals in Manage billing.`
    : "Monthly renews each month. Annual charges US$99 each year. Cancel future renewals in Manage billing.";
  const pack = currentOffers?.creditPack;
  byId("credit-pack").hidden = !(pack?.available && !(entitlement.plan === "pro" && entitlement.hasBillingSubscription));
  if (pack) byId("buy-credits").textContent = `Buy ${pack.reports} reports · ${money(pack.priceUsd * 100)}`;
}

async function startCreditCheckout(button: HTMLButtonElement): Promise<void> {
  if (!currentOffers?.creditPack.available) {
    setMessage("Report packs are not available yet. Your free reports and BYOK mode are available now.", "error");
    return;
  }
  button.disabled = true;
  try {
    const result = await apiFetch<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ kind: "credit_pack" }) });
    try { if (activeReport) sessionStorage.setItem("videolens.checkoutReport", JSON.stringify({ userId: session?.user.id, reportId: activeReport.id })); } catch { /* Cloud library remains available. */ }
    location.href = result.url;
  } catch (error) {
    button.disabled = false;
    setMessage(asMessage(error), "error");
  }
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
    setMessage("Checkout is not live yet. Your three free starter reports and BYOK mode are available now.", "error");
    return;
  }
  button.disabled = true;
  trackJourney("checkout_clicked");
  try {
    const result = await apiFetch<{ url: string }>("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ billing }),
    });
    try { if (activeReport) sessionStorage.setItem("videolens.checkoutReport", JSON.stringify({ userId: session?.user.id, reportId: activeReport.id })); } catch { /* Cloud library remains available. */ }
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
    try { if (activeReport) sessionStorage.setItem("videolens.checkoutReport", JSON.stringify({ userId: session?.user.id, reportId: activeReport.id })); } catch { /* Cloud library remains available. */ }
    location.href = result.url;
  } catch (error) {
    button.disabled = false;
    setMessage(asMessage(error), "error");
  }
}

async function loadReports(): Promise<void> {
  const accountId = session?.user.id;
  const loaded: CloudReport[] = [];
  let offset: number | null = 0;
  do {
    const page: { reports: CloudReport[]; nextOffset: number | null } = await apiFetch(`/api/reports?offset=${offset}`);
    loaded.push(...page.reports);
    offset = page.nextOffset ?? null;
  } while (offset !== null);
  if (!session || session.user.id !== accountId) return;
  reports = [...new Map(loaded.map(report => [report.id, report])).values()];
  reportSearch = new Map(reports.map(report => [report.id, reportSearchText(report)]));
  renderReports();
  if (new URL(location.href).searchParams.has("checkout")) {
    try {
      const saved = JSON.parse(sessionStorage.getItem("videolens.checkoutReport") || "null");
      const report = saved?.userId === session.user.id && reports.find(report => report.id === saved.reportId);
      if (report) openReport(report);
      sessionStorage.removeItem("videolens.checkoutReport");
    } catch { /* Storage may be disabled; cloud reports are still in Library. */ }
  }
  openLinkedReport();
}

function renderReports(): void {
  const root = byId("report-list");
  const empty = byId("empty-library");
  const query = byId<HTMLInputElement>("report-search").value.trim().toLocaleLowerCase();
  const visible = reports.filter(report => reportSearch.get(report.id)?.includes(query));
  byId("library-count").textContent = query ? `${visible.length} of ${reports.length} reports` : `${reports.length} saved ${reports.length === 1 ? "report" : "reports"}`;
  root.replaceChildren();
  empty.hidden = visible.length > 0;
  empty.querySelector("h3")!.textContent = reports.length ? "No reports match your search." : "No cloud reports yet.";
  empty.querySelector("p")!.textContent = reports.length
    ? "Try a different search or clear the search box."
    : "In extension Settings, connect this account and choose Upload existing reports to my cloud library. Use the latest extension from your browser’s store.";

  for (const report of visible) {
    const card = document.createElement("article");
    card.className = "report-card";
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    const titleButton = document.createElement("button");
    titleButton.className = "report-title-button";
    titleButton.type = "button";
    titleButton.textContent = reportTitle(report);
    titleButton.addEventListener("click", () => openReport(report));
    title.append(titleButton);
    const summary = document.createElement("p");
    summary.textContent = typeof report.report_data?.summary === "string"
      ? report.report_data.summary
      : "Saved VideoLens report";
    summary.className = "report-excerpt";
    const meta = document.createElement("div");
    meta.className = "report-meta";
    const qaCount = Array.isArray(report.report_data?.qa) ? report.report_data.qa.length : 0;
    meta.textContent = `${reportMode(report)} · ${reportDate(report)}${qaCount ? ` · ${qaCount} follow-up ${qaCount === 1 ? "answer" : "answers"}` : ""}`;
    copy.append(title, summary, meta);

    const actions = document.createElement("div");
    actions.className = "report-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "open-report";
    open.textContent = "Open report";
    open.setAttribute("aria-label", `Open report: ${reportTitle(report)}`);
    open.addEventListener("click", () => openReport(report));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.className = "delete-report";
    remove.setAttribute("aria-label", `Delete cloud report: ${reportTitle(report)}`);
    remove.addEventListener("click", () => void deleteReport(report));
    actions.append(open, exportMenu(() => report), remove);
    card.append(copy, actions);
    root.appendChild(card);
  }
}

function openReport(report: CloudReport): void {
  trackJourney("report_opened", report.id);
  activeReport = report;
  byId("reader-title").textContent = reportTitle(report);
  byId("reader-content").innerHTML = reportBody(report);
  const data = report.report_data ?? {};
  const source = data.source as { url?: string } | undefined;
  if (session?.user.id) bindLessonStudy(byId("reader-content"), data.lesson, `account:${session.user.id}:${report.id}`, typeof data.outputLanguage === "string" ? data.outputLanguage : undefined, source?.url ?? null);
  if (!reader.open) reader.showModal();
  byId("reader-content").scrollTop = 0;
  document.body.classList.add("reading-report");
  history.replaceState(null, "", `${location.pathname}${location.search}#report=${encodeURIComponent(report.id)}`);
}

function openLinkedReport(): void {
  if (!location.hash.startsWith("#report=")) { if (reader.open) reader.close(); return; }
  const id = new URLSearchParams(location.hash.slice(1)).get("report");
  const report = reports.find(candidate => candidate.id === id);
  if (report && activeReport !== report) openReport(report);
  else if (session && !report) setMessage("This report is unavailable in your cloud library.", "error");
}

function exportMenu(getReport: () => CloudReport | null): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = "report-export";
  select.setAttribute("aria-label", "Export report");
  for (const [value, label] of [["", "Export…"], ["pdf", "Print / Save PDF"], ["html", "Download HTML"], ["md", "Download Markdown"], ["json", "Download JSON"]]) {
    select.add(new Option(label, value));
  }
  select.addEventListener("change", () => {
    const report = getReport(), format = select.value;
    select.value = "";
    if (!report || !format) return;
    try {
      if (format === "pdf") printReport(report);
      else downloadReport(report, format);
      trackJourney("report_exported", report.id);
    } catch (error) { setMessage(asMessage(error), "error"); }
  });
  return select;
}

function printReport(report: CloudReport): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    downloadReport(report, "html");
    window.alert("Your browser blocked the print window. The HTML report was downloaded; open it and choose Print to save a PDF.");
    return;
  }
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.addEventListener("load", () => {
    printWindow.document.querySelectorAll("details").forEach(details => { details.open = true; });
    printWindow.focus();
    printWindow.print();
  }, { once: true });
  printWindow.document.write(reportHtml(report, __REPORT_CSS__));
  printWindow.document.close();
}

function downloadReport(report: CloudReport, format: string): void {
  const content = format === "html" ? reportHtml(report, __REPORT_CSS__) : format === "md" ? reportMarkdown(report) : reportJson(report);
  const mime = format === "html" ? "text/html" : format === "md" ? "text/markdown" : "application/json";
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = reportFilename(report, format);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
}

async function deleteReport(report: CloudReport): Promise<void> {
  if (!confirm(`Delete “${reportTitle(report)}” from your cloud library? Your local extension copy will remain available.`)) return;
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
  if (checkout === "success") setMessage("Checking your subscription. Your report is still in the extension’s Library.");
  if (checkout === "credits") setMessage("Confirming your report pack…");
  if (checkout === "cancelled") setMessage("Checkout was cancelled. Your saved report is still available; you can continue with your own key.");
}

async function confirmCheckout(): Promise<void> {
  if (checkoutPolling || !session || new URL(location.href).searchParams.get("checkout") !== "success") return;
  checkoutPolling = true;
  const accountId = session.user.id;
  const checkoutId = new URL(location.href).searchParams.get("session_id");
  trackJourney("checkout_returned");
  try {
    for (let attempt = 0; attempt < 12; attempt++) {
      if (session?.user.id !== accountId) return;
      if (checkoutId) {
        const result = await apiFetch<{status:string;paymentStatus:string}>(`/api/checkout-status?session=${encodeURIComponent(checkoutId)}`);
        if (session?.user.id !== accountId) return;
        if (result.status !== "complete") { setMessage("Checkout has not completed. You can choose a plan below when you’re ready."); return; }
      }
      await loadEntitlement();
      if (session?.user.id !== accountId) return;
      if (checkoutReady(currentEntitlement)) {
        setMessage("Pro access is ready. Return to the VideoLens extension to continue. Your saved report is in Library.", "success");
        const url = new URL(location.href); url.searchParams.delete("checkout"); url.searchParams.delete("session_id");
        history.replaceState(null, "", url.pathname + url.search + url.hash);
        return;
      }
      if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 2500));
    }
    setMessage("Your subscription is still being confirmed. Use Refresh account access in a moment. Your saved reports remain available.");
  } catch {
    setMessage("We could not confirm your subscription yet. Use Refresh account access to try again.", "error");
  } finally { checkoutPolling = false; }
}

async function confirmCreditPack(): Promise<void> {
  const params = new URL(location.href).searchParams;
  if (checkoutPolling || !session || params.get("checkout") !== "credits") return;
  const checkoutId = params.get("session_id");
  if (!checkoutId) return;
  checkoutPolling = true;
  const accountId = session.user.id;
  const clear = () => { const url = new URL(location.href); url.searchParams.delete("checkout"); url.searchParams.delete("session_id"); history.replaceState(null, "", url.pathname + url.search + url.hash); };
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      const result = await apiFetch<{ status: string; paymentStatus: string }>(`/api/checkout-status?session=${encodeURIComponent(checkoutId)}`);
      if (session?.user.id !== accountId) return;
      if (result.status !== "complete") { setMessage("Your payment has not completed. You can buy a report pack below when you’re ready."); clear(); return; }
      if (result.paymentStatus === "paid") {
        await loadEntitlement();
        if (session?.user.id !== accountId) return;
        const left = currentEntitlement?.managedReportsRemaining ?? 0;
        setMessage(`${currentOffers?.creditPack.reports ?? 5} reports added. You now have ${left} ${left === 1 ? "report" : "reports"} left, and purchased reports never expire.`, "success");
        clear();
        return;
      }
      if (attempt < 7) await new Promise(resolve => setTimeout(resolve, 2500));
    }
    setMessage("Your payment is still processing. Your reports are added as soon as it clears; use Refresh account access in a moment.");
  } catch {
    setMessage("We could not confirm your report pack yet. Use Refresh account access to try again.", "error");
  } finally { checkoutPolling = false; }
}

function trackJourney(event: JourneyEvent, reportId?: string): void {
  if (!session) return;
  void apiFetch("/api/journey", { method:"POST", body:JSON.stringify({event,...(reportId ? {reportId}: {})}), keepalive:true }).catch(() => {});
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
