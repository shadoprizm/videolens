// chrome.storage wrappers. The OpenAI key stays in storage.local only —
// never storage.sync — so it does not leave this browser profile.

export interface LicenseState {
  licenseKey: string;
  instanceId: string;
  activatedAt: number;
  lastValidatedAt: number;
  valid: boolean;
}

interface LocalState {
  openaiApiKey?: string;
  trialUsed?: number;
  license?: LicenseState;
  maxFrames?: number;
}

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

export async function getTrialUsed(): Promise<number> {
  return (await getLocal()).trialUsed ?? 0;
}

export async function incrementTrialUsed(): Promise<number> {
  const used = (await getTrialUsed()) + 1;
  await chrome.storage.local.set({ trialUsed: used });
  return used;
}

export async function getLicense(): Promise<LicenseState | null> {
  return (await getLocal()).license ?? null;
}

export async function setLicense(license: LicenseState | null): Promise<void> {
  if (license) {
    await chrome.storage.local.set({ license });
  } else {
    await chrome.storage.local.remove("license");
  }
}

export async function getMaxFrames(defaultValue: number): Promise<number> {
  return (await getLocal()).maxFrames ?? defaultValue;
}

export async function setMaxFrames(value: number): Promise<void> {
  await chrome.storage.local.set({ maxFrames: value });
}
