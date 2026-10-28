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
  freeManagedReports: 3,
  proManagedReports: 20,
  monthlyPriceUsd: 12,
  annualPriceUsd: 99,
  creditPackReports: 5,
  creditPackPriceCents: 500,
  // 40% off for life for the first 100 paying subscribers, closing at the end
  // of 2026-12-31 in Toronto (midnight EST is 05:00 UTC).
  foundingPercentOff: 40,
  foundingSpots: 100,
  // A full counter ("100 of 100 left") reads as no demand, so the live count
  // appears only once this many spots are claimed. Never show invented numbers.
  foundingCountAfterClaimed: 10,
  foundingEndsAt: "2027-01-01T05:00:00Z",
} as const;
