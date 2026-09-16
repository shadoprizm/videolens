// Browser extension storage wrappers. The OpenAI key stays in storage.local only —
// never storage.sync — so it does not leave this browser profile.
import { isReportLanguage, type ReportLanguage } from "./languages";

interface LocalState {
  openaiApiKey?: string;
  maxFrames?: number;
  privacyDisclosureVersion?: number;
  analysisProvider?: AnalysisProvider;
  proToken?: string;
  proEmail?: string;
  proDeviceId?: string;
  proPairingNonce?: string;
  proCloudSave?: boolean;
  cloudLibraryAccount?: string;
  reportLanguage?: ReportLanguage;
  hasCompletedFirstReport?: boolean;
}

export type AnalysisProvider = "byok" | "pro";

export interface StoredProSession {
  token: string;
  email: string;
}

export const PRIVACY_DISCLOSURE_VERSION = 3;

async function getLocal(): Promise<LocalState> {
  return (await chrome.storage.local.get(null)) as LocalState;
}

export async function getApiKey(): Promise<string | null> {
  return (await getLocal()).openaiApiKey ?? null;
}

export async function setApiKey(key: string | null): Promise<void> {
  if (key) {
    await chrome.storage.local.set({ openaiApiKey: key });
  } else {
    await chrome.storage.local.remove("openaiApiKey");
  }
}

export async function getMaxFrames(defaultValue: number): Promise<number> {
  return (await getLocal()).maxFrames ?? defaultValue;
}

export async function setMaxFrames(value: number): Promise<void> {
  await chrome.storage.local.set({ maxFrames: value });
}

export async function hasAcceptedPrivacyDisclosure(): Promise<boolean> {
  return (await getLocal()).privacyDisclosureVersion === PRIVACY_DISCLOSURE_VERSION;
}

export async function acceptPrivacyDisclosure(): Promise<void> {
  await chrome.storage.local.set({ privacyDisclosureVersion: PRIVACY_DISCLOSURE_VERSION });
}

export async function resetPrivacyDisclosure(): Promise<void> {
  await chrome.storage.local.remove("privacyDisclosureVersion");
}

export async function getAnalysisProvider(): Promise<AnalysisProvider> {
  return (await getLocal()).analysisProvider ?? "byok";
}

export async function setAnalysisProvider(value: AnalysisProvider): Promise<void> {
  await chrome.storage.local.set({ analysisProvider: value });
}

export async function getProSession(): Promise<StoredProSession | null> {
  const state = await getLocal();
  return state.proToken && state.proEmail ? { token: state.proToken, email: state.proEmail } : null;
}

export async function setProSession(session: StoredProSession | null): Promise<void> {
  if (session) {
    const previous = await getProSession();
    if (previous?.email !== session.email) await chrome.storage.local.remove("cloudLibraryAccount");
    await chrome.storage.local.set({ proToken: session.token, proEmail: session.email });
  } else {
    await chrome.storage.local.remove(["proToken", "proEmail", "proPairingNonce", "cloudLibraryAccount"]);
  }
}

export async function getOrCreateProDeviceId(): Promise<string> {
  const state = await getLocal();
  if (state.proDeviceId) return state.proDeviceId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ proDeviceId: id });
  return id;
}

export async function getProPairingNonce(): Promise<string | null> {
  return (await getLocal()).proPairingNonce ?? null;
}

export async function setProPairingNonce(value: string | null): Promise<void> {
  if (value) await chrome.storage.local.set({ proPairingNonce: value });
  else await chrome.storage.local.remove("proPairingNonce");
}

export async function getProCloudSave(): Promise<boolean> {
  return (await getLocal()).proCloudSave ?? false;
}

export async function setProCloudSave(value: boolean): Promise<void> {
  await chrome.storage.local.set({ proCloudSave: value });
}

// Separate consent from the old managed-only checkbox; never silently broaden it to BYOK.
export async function getCloudLibraryEnabled(): Promise<boolean> {
  const state = await getLocal();
  return !!state.proToken && !!state.proEmail && state.cloudLibraryAccount === state.proEmail;
}

export async function setCloudLibraryEnabled(value: boolean): Promise<void> {
  const session = await getProSession();
  if (value && session) await chrome.storage.local.set({ cloudLibraryAccount: session.email });
  else await chrome.storage.local.remove("cloudLibraryAccount");
  await setProCloudSave(value && !!session);
}

export async function getReportLanguage(): Promise<ReportLanguage> {
  const value = (await getLocal()).reportLanguage;
  return isReportLanguage(value) ? value : "browser";
}

export async function setReportLanguage(value: ReportLanguage): Promise<void> {
  await chrome.storage.local.set({ reportLanguage: value });
}

export async function hasCompletedFirstReport(): Promise<boolean> {
  return (await getLocal()).hasCompletedFirstReport === true;
}

export async function markFirstReportCompleted(): Promise<void> {
  await chrome.storage.local.set({ hasCompletedFirstReport: true });
}
