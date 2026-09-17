import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Member = { complimentary?: { state: string; expiresAt: string | null } | null; id: string; email: string | null; created_at: string; last_sign_in_at: string | null; verified: boolean; membership: string; subscription_status: string; cancel_at_period_end: boolean; current_period_end: string | null; scans: number; managed_scans: number; library_uploads: number; scans_this_month: number; last_scan_at: string | null };
type Activity = { allowance_released: boolean; ai_request_count: number; recovered_requests: number; last_ai_error: { stage: string; code: string; httpStatus: number | null; model: string; at: string } | null; kind: string; title: string; email: string | null; source_type: string | null; mode: string | null; status: string; created_at: string; completed_at: string | null; cloud_saved: boolean };
type Snapshot = { generatedAt: string; summary: { members: number; paid: number; free: number; trial: number; complimentary: number; active30Days: number }; scans: { total: number; libraryUploads: number; last30Days: number; complete: number; failed: number; pending: number }; members: Member[]; memberCount: number; activity: Activity[]; activityCount: number; sources: { label: string; count: number }[]; modes: { label: string; count: number }[]; daily: { day: string; count: number }[] };
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let client: SupabaseClient;
let memberPage = 1;
let activityPage = 1;
let memberId = "";
let memberEmail = "";
let query = "";
let membership = "all";
let sequence = 0;
let pending: AbortController | undefined;
const labels: Record<string, string> = { paid: "Paid Pro", free: "Free", trial: "Pro trial", complimentary: "Complimentary Pro" };
const errorLabels: Record<string, string> = {
  model_access_denied: "Provider blocked the requested model", rate_limited: "AI provider rate limit",
  provider_authentication: "AI provider authentication failed", provider_unavailable: "AI provider unavailable",
  invalid_provider_response: "AI returned an invalid response", invalid_ai_input: "AI request rejected",
  network_error: "AI connection failed", request_timeout: "AI request timed out", configuration_error: "Managed AI configuration failed",
};
const date = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Never";

function text(tag: string, value: string, className = ""): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = value;
  node.className = className;
  return node;
}
function showMessage(value: string, error = false): void {
  el("message").textContent = value;
  el("message").hidden = !value;
  el("message").className = error ? "error" : "";
}
function clearSensitiveData(): void {
  pending?.abort();
  sequence++;
  el("dashboard").hidden = true;
  for (const id of ["members", "activity", "metrics", "sources", "modes", "chart", "activation-funnel"]) el(id).replaceChildren();
  el("updated").textContent = "";
  el("scan-summary").textContent = "";
  memberId = "";
  memberEmail = "";
  el("activity-title").textContent = "Scan activity";
  el("refresh").hidden = true;
}
async function load(): Promise<void> {
  const current = ++sequence;
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  el<HTMLButtonElement>("refresh").disabled = true;
  showMessage("Loading dashboard…");
  try {
    const { data, error } = await client.auth.getSession();
    if (current !== sequence) return;
    if (error) throw error;
    if (!data.session) {
      clearSensitiveData(); el("access").hidden = false; el("sign-out").hidden = true;
      showMessage(""); return;
    }
    el("sign-out").hidden = false;
    const params = new URLSearchParams({ q: query, membership, page: String(memberPage), activityPage: String(activityPage) });
    if (memberId) params.set("userId", memberId);
    const response = await fetch(`/api/admin?${params}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store", signal: controller.signal });
    const result = await response.json();
    if (current !== sequence) return;
    if (!response.ok) {
      clearSensitiveData(); el("access").hidden = false;
      throw new Error(result.message || "Could not load the dashboard.");
    }
    render(result as Snapshot);
    void loadFunnel(data.session.access_token, current, controller.signal);
    el("dashboard").hidden = false; el("access").hidden = true; el("refresh").hidden = false;
    showMessage("");
  } catch (error) {
    if (controller.signal.aborted) return;
    // Retain no previous account data after any failed authorization/load.
    clearSensitiveData();
    showMessage(error instanceof Error ? error.message : "Could not load the dashboard.", true);
    el("refresh").hidden = false;
  } finally {
    if (pending === controller) el<HTMLButtonElement>("refresh").disabled = false;
  }
}
async function loadFunnel(token: string, current: number, signal: AbortSignal): Promise<void> {
  const labels: Record<string,string> = { account_connected: "Account connected", starter_started: "Starter started", starter_completed: "Starter completed", starter_failed: "Starter failed", checkout_started: "Checkout opened", subscription_active: "Subscription active", pro_started: "Pro report started", pro_completed: "Pro report completed", pro_failed: "Pro report failed" };
  try {
    const response = await fetch("/api/admin?view=funnel", { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!response.ok) throw new Error("Unavailable");
    const data = await response.json() as { events: { event: string; members: number; occurrences: number }[] };
    if (current !== sequence) return;
    el("activation-funnel").replaceChildren(...Object.entries(labels).map(([event,label]) => {
      const row = data.events.find(row => row.event === event);
      const card = text("article", "", "metric");
      card.append(text("span",label,"label"),text("strong",String(row?.members || 0)),text("small",`${row?.occurrences || 0} events`));
      return card;
    }));
  } catch { if (current === sequence) el("activation-funnel").replaceChildren(text("p","Activation metrics are temporarily unavailable.")); }
}

function render(data: Snapshot): void {
  el("updated").textContent = `Updated ${date(data.generatedAt)}`;
  const cards: [string, number][] = [["Registered members", data.summary.members], ["Paid Pro", data.summary.paid], ["Free", data.summary.free], ["Complimentary Pro", data.summary.complimentary], ["Pro trials", data.summary.trial], ["Signed in · 30 days", data.summary.active30Days]];
  el("metrics").replaceChildren(...cards.map(([label, value]) => {
    const card = text("article", "", "metric");
    card.append(text("span", label, "label"), text("strong", value.toLocaleString())); return card;
  }));
  const max = Math.max(1, ...data.daily.map(day => day.count));
  el("chart").setAttribute("aria-label", data.daily.map(day => `${day.day}: ${day.count} scans`).join("; "));
  el("chart").replaceChildren(...data.daily.map(day => {
    const bar = text("div", "", "bar"); bar.title = `${day.day}: ${day.count} scans`;
    const fill = text("i", ""); fill.style.height = `${day.count / max * 95}px`;
    bar.append(fill, text("span", day.day.slice(5))); return bar;
  }));
  el("scan-summary").textContent = `${data.scans.total} managed · ${data.scans.last30Days} in 30 days · ${data.scans.complete} complete · ${data.scans.failed} failed · ${data.scans.pending} pending · ${data.scans.libraryUploads} library uploads`;
  for (const [id, rows] of [["sources", data.sources], ["modes", data.modes]] as const) {
    el(id).replaceChildren(...(rows.length ? rows.map(row => {
      const item = text("div", "", "breakdown"); item.append(text("span", row.label), text("strong", String(row.count))); return item;
    }) : [text("p", "No managed scans recorded yet.", "muted")]));
  }
  el("member-count").textContent = `${data.memberCount} matching members`;
  el("members").replaceChildren(...data.members.map(member => {
    const row = document.createElement("tr");
    const identity = text("td", member.email || "No email");
    identity.append(text("small", member.verified ? "Verified email" : "Email not verified"));
    const plan = text("td", ""); plan.append(text("span", labels[member.membership] || member.membership, `pill ${member.membership}`));
    const billing = text("td", member.membership === "complimentary" ? "Complimentary" : member.subscription_status);
    if (member.complimentary?.state === "pending") billing.append(text("small", "30-day Pro offer · starts after next successful scan"));
    else if (member.complimentary) billing.append(text("small", `${member.complimentary.state === "active" ? "Offer ends" : "Offer expired"} ${date(member.complimentary.expiresAt)}`));
    if (member.cancel_at_period_end) billing.append(text("small", `Cancels ${date(member.current_period_end)}`));
    const scans = text("td", ""); const button = text("button", String(member.scans), "count-button");
    button.setAttribute("aria-label", `View scans for ${member.email || "member"}`);
    button.addEventListener("click", () => {
      memberId = member.id; memberEmail = member.email || "Member"; activityPage = 1;
      void load().then(() => el("activity-panel").scrollIntoView({ behavior: "smooth", block: "start" }));
    });
    scans.append(button, text("small", `${member.managed_scans} managed · ${member.library_uploads} uploaded`));
    row.append(identity, plan, billing, text("td", date(member.created_at)), text("td", date(member.last_sign_in_at)), scans, text("td", date(member.last_scan_at)));
    return row;
  }));
  if (!data.members.length) emptyRow("members", 7, "No members match these filters.");
  el("activity-title").textContent = memberId ? `Scans · ${memberEmail}` : "Scan activity";
  el("clear-member").hidden = !memberId;
  el("activity").replaceChildren(...data.activity.map(scan => {
    const row = document.createElement("tr");
    const status = text("td", ""); status.append(text("span", scan.status, `pill ${scan.status}`));
    if (scan.allowance_released) status.append(text("small", "Credit returned"));
    const diagnostic = text("td", "");
    if (scan.last_ai_error) {
      const error = scan.last_ai_error;
      diagnostic.append(text("span", errorLabels[error.code] || "AI request failed"), text("small", `${error.stage} · ${error.model}${error.httpStatus ? ` · HTTP ${error.httpStatus}` : ""}`));
    } else if (scan.status === "failed") {
      diagnostic.append(text("span", scan.ai_request_count === 0 ? "Failed before any recorded AI request" : "Historical error not recorded"));
    } else diagnostic.append(text("span", scan.recovered_requests ? "Recovered automatically" : "—"));
    diagnostic.append(text("small", `${scan.ai_request_count} AI requests${scan.recovered_requests ? ` · ${scan.recovered_requests} model fallbacks` : ""}`));
    row.append(text("td", scan.title === "Untitled video" ? "Title not reported" : scan.title), text("td", scan.email || "No email"), text("td", scan.kind), text("td", scan.source_type || "Not reported"), text("td", scan.mode || "Not reported"), status, diagnostic, text("td", date(scan.created_at)), text("td", scan.completed_at ? date(scan.completed_at) : "—"), text("td", scan.cloud_saved ? "Yes" : "No"));
    return row;
  }));
  if (!data.activity.length) emptyRow("activity", 10, "No reports recorded for this selection.");
  pagination("members", memberPage, data.memberCount);
  pagination("activity", activityPage, data.activityCount);
}
function emptyRow(id: string, columns: number, message: string): void {
  const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = columns; cell.textContent = message; row.append(cell); el(id).append(row);
}
function pagination(id: string, page: number, total: number): void {
  const pages = Math.max(1, Math.ceil(total / 50));
  el(`${id}-page`).textContent = `Page ${page} of ${pages} · ${total} records`;
  el<HTMLButtonElement>(`${id}-prev`).disabled = page <= 1;
  el<HTMLButtonElement>(`${id}-next`).disabled = page >= pages;
}
async function boot(): Promise<void> {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("Account configuration is unavailable.");
    const config = await response.json();
    if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error("Account services are unavailable.");
    client = createClient(config.supabaseUrl, config.supabasePublishableKey);
    client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { clearSensitiveData(); el("access").hidden = false; el("sign-out").hidden = true; showMessage("Signed out."); }
      else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") queueMicrotask(() => void load());
    });
    el("refresh").addEventListener("click", () => void load());
    el("sign-out").addEventListener("click", () => {
      clearSensitiveData();
      void client.auth.signOut().then(({ error }) => { if (error) showMessage(error.message, true); });
    });
    el("filters").addEventListener("submit", event => {
      event.preventDefault(); query = el<HTMLInputElement>("search").value; membership = el<HTMLSelectElement>("membership").value; memberPage = 1; void load();
    });
    for (const [id, change] of [["members-prev", -1], ["members-next", 1], ["activity-prev", -1], ["activity-next", 1]] as const) {
      el(id).addEventListener("click", () => { if (id.startsWith("members")) memberPage += change; else activityPage += change; void load(); });
    }
    el("clear-member").addEventListener("click", () => { memberId = ""; memberEmail = ""; activityPage = 1; void load(); });
    window.addEventListener("pagehide", clearSensitiveData);
    window.addEventListener("pageshow", event => { if (event.persisted) void load(); });
    await load();
  } catch (error) { showMessage(error instanceof Error ? error.message : "Dashboard unavailable.", true); }
}
void boot();
