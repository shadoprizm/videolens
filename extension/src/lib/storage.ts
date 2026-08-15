// chrome.storage wrappers. The OpenAI key stays in storage.local only —
// never storage.sync — so it does not leave this browser profile.

interface LocalState {
  openaiApiKey?: string;
  maxFrames?: number;
  privacyDisclosureVersion?: number;
}

export const PRIVACY_DISCLOSURE_VERSION = 1;

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
