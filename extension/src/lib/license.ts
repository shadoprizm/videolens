// Lemon Squeezy license lifecycle. The /v1/licenses/* endpoints are public
// (designed to be called from distributed apps), so no Lemon Squeezy API key
// ships with the extension.
import { LEMON, TRIAL_ANALYSES } from "./config";
import { getLicense, getTrialUsed, setLicense, type LicenseState } from "./storage";

const API = "https://api.lemonsqueezy.com/v1/licenses";
const REVALIDATE_MS = 7 * 24 * 60 * 60 * 1000; // weekly
const OFFLINE_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // keep working offline for 30 days

export class LicenseError extends Error {}

export type Entitlement =
  | { kind: "licensed" }
  | { kind: "trial"; remaining: number }
  | { kind: "locked" };

export async function getEntitlement(): Promise<Entitlement> {
  const license = await getLicense();
  if (license?.valid) {
    void revalidateIfStale(license);
    return { kind: "licensed" };
  }
  const used = await getTrialUsed();
  const remaining = Math.max(0, TRIAL_ANALYSES - used);
  return remaining > 0 ? { kind: "trial", remaining } : { kind: "locked" };
}

export async function activateLicense(licenseKey: string): Promise<LicenseState> {
  const key = licenseKey.trim();
  if (!key) throw new LicenseError("Enter your license key.");

  const data = await post(`${API}/activate`, {
    license_key: key,
    instance_name: `chrome-${crypto.randomUUID().slice(0, 8)}`,
  });

  if (!data.activated) {
    throw new LicenseError(String(data.error ?? "Activation failed."));
  }
  assertOurProduct(data);

  const state: LicenseState = {
    licenseKey: key,
    instanceId: String(data.instance?.id ?? ""),
    activatedAt: Date.now(),
    lastValidatedAt: Date.now(),
    valid: true,
  };
  await setLicense(state);
  return state;
}

export async function deactivateLicense(): Promise<void> {
  const license = await getLicense();
  if (license) {
    try {
      await post(`${API}/deactivate`, {
        license_key: license.licenseKey,
        instance_id: license.instanceId,
      });
    } catch {
      // Deactivation is best-effort; clear locally regardless.
    }
  }
  await setLicense(null);
}

async function revalidateIfStale(license: LicenseState): Promise<void> {
  if (Date.now() - license.lastValidatedAt < REVALIDATE_MS) return;
  try {
    const data = await post(`${API}/validate`, {
      license_key: license.licenseKey,
      instance_id: license.instanceId,
    });
    const valid = Boolean(data.valid);
    if (valid) assertOurProduct(data);
    await setLicense({ ...license, valid, lastValidatedAt: Date.now() });
  } catch {
    // Network failure: keep the license valid within the offline grace window.
    if (Date.now() - license.lastValidatedAt > OFFLINE_GRACE_MS) {
      await setLicense({ ...license, valid: false });
    }
  }
}

function assertOurProduct(data: Record<string, any>): void {
  // Defense against keys from another Lemon Squeezy product being used here.
  if (!LEMON.storeId && !LEMON.productId) return; // not wired up yet
  const meta = data.meta ?? {};
  if (LEMON.storeId && Number(meta.store_id) !== LEMON.storeId) {
    throw new LicenseError("This license key belongs to a different store.");
  }
  if (LEMON.productId && Number(meta.product_id) !== LEMON.productId) {
    throw new LicenseError("This license key belongs to a different product.");
  }
}

async function post(url: string, body: Record<string, string>): Promise<Record<string, any>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LicenseError("Could not reach the license server. Check your connection and retry.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.error) {
    throw new LicenseError(`License server error (${res.status}).`);
  }
  return data;
}
