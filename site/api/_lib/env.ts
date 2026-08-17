export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function optionalEnv(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function siteUrl(): string {
  return (optionalEnv("VIDEOLENS_SITE_URL") || "https://videolens.io").replace(/\/$/, "");
}

export const planConfig = {
  freeManagedReports: 1,
  proManagedReports: 20,
  monthlyPriceUsd: 12,
  annualPriceUsd: 99,
} as const;
