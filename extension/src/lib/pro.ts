import { LINKS } from "./config";
import {
  getOrCreateProDeviceId,
  getProPairingNonce,
  getProSession,
  setProPairingNonce,
  setProSession,
  type StoredProSession,
} from "./storage";
import type { Analysis } from "./types";

export interface ProEntitlement {
  plan: "free" | "pro";
  subscriptionStatus: string;
  managedReportsUsed: number;
  managedReportsLimit: number;
  managedReportsRemaining: number;
  periodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canUseManagedAi: boolean;
}

export interface ManagedReservation {
  reportId: string;
  plan: "free" | "pro";
  used: number;
  limit: number;
}

const PRO_ORIGIN = `${LINKS.site}/*`;

export async function ensureProHostPermission(): Promise<boolean> {
  if (!chrome.permissions) return false;
  if (await chrome.permissions.contains({ origins: [PRO_ORIGIN] })) return true;
  return chrome.permissions.request({ origins: [PRO_ORIGIN] });
}

export async function startProConnection(): Promise<StoredProSession> {
  if (!(await ensureProHostPermission())) throw new Error("Allow access to videolens.io to connect Pro.");
  const deviceId = await getOrCreateProDeviceId();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = base64Url(bytes);
  await setProPairingNonce(nonce);
  const url = new URL(LINKS.account);
  url.searchParams.set("connect", nonce);
  url.searchParams.set("device", deviceId);
  await chrome.tabs.create({ url: url.toString(), active: true });
  return pollForProConnection(nonce, deviceId, 120_000);
}

export async function resumeProConnection(timeoutMs = 5_000): Promise<StoredProSession | null> {
  const nonce = await getProPairingNonce();
  if (!nonce) return null;
  if (!(await ensureProHostPermission())) return null;
  const deviceId = await getOrCreateProDeviceId();
  try {
    return await pollForProConnection(nonce, deviceId, timeoutMs);
  } catch {
    return null;
  }
}

async function pollForProConnection(nonce: string, deviceId: string, timeoutMs: number): Promise<StoredProSession> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = new URL(`${LINKS.api}/api/extension-token`);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("device_id", deviceId);
    const response = await fetch(url);
    if (response.status === 202) {
      await delay(1_500);
      continue;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not connect the VideoLens account.");
    const session = { token: String(data.token), email: String(data.email) };
    await setProSession(session);
    await setProPairingNonce(null);
    return session;
  }
  throw new Error("Account connection is still waiting. Return to Settings after approving it in the browser tab.");
}

export async function disconnectPro(): Promise<void> {
  await setProSession(null);
}

export async function fetchProEntitlement(token?: string): Promise<ProEntitlement> {
  const session = token ? { token } : await getProSession();
  if (!session) throw new Error("Connect your VideoLens account first.");
  const data = await proJson<{ entitlement: ProEntitlement }>("/api/entitlement", session.token);
  return data.entitlement;
}

export async function reserveManagedReport(token: string, cloudSave: boolean): Promise<ManagedReservation> {
  const deviceId = await getOrCreateProDeviceId();
  const data = await proJson<{ reservation: ManagedReservation }>("/api/reports", token, {
    method: "POST",
    body: JSON.stringify({ action: "reserve", deviceId, cloudSave }),
  });
  return data.reservation;
}

export async function completeManagedReport(
  token: string,
  reportId: string,
  analysis: Analysis | null,
  cloudSave: boolean,
  failed = false,
): Promise<void> {
  await proJson("/api/reports", token, {
    method: "POST",
    body: JSON.stringify({
      action: "complete",
      reportId,
      status: failed ? "failed" : "complete",
      cloudSave: !failed && cloudSave,
      title: analysis?.source.title || "Untitled video",
      sourceType: analysis?.source.sourceType || "video",
      mode: analysis?.mode || "general",
      reportData: !failed && cloudSave ? analysis : undefined,
    }),
  });
}

export function openProAccount(): void {
  void chrome.tabs.create({ url: LINKS.account, active: true });
}

async function proJson<T = Record<string, unknown>>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${LINKS.api}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) await setProSession(null);
    throw new Error(data.message || `VideoLens Pro request failed (${response.status}).`);
  }
  return data as T;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
