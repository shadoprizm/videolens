import { optionalEnv, planConfig } from "./_lib/env.js";
import { errorResponse, json, options } from "./_lib/http.js";
import { foundingOffer } from "./_lib/stripe.js";

const discountedUsd = (usd: number, percentOff: number) => Math.round(usd * (100 - percentOff)) / 100;

const FOUNDING_LOOKUP_MS = 2_000;

// Public offer facts only. A failed or slow count lookup closes the offer here
// rather than failing or delaying the configuration the account page needs.
async function publicFoundingOffer() {
  const closed = { available: false as const };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const offer = await Promise.race([
      foundingOffer(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), FOUNDING_LOOKUP_MS); }),
    ]);
    if (!offer.available) return closed;
    return {
      available: true as const,
      percentOff: offer.percentOff,
      spots: offer.spots,
      ...(offer.showCount ? { spotsLeft: offer.spotsLeft } : {}),
      endsAt: offer.endsAt,
      monthlyPriceUsd: discountedUsd(planConfig.monthlyPriceUsd, offer.percentOff),
      annualPriceUsd: discountedUsd(planConfig.annualPriceUsd, offer.percentOff),
    };
  } catch {
    console.warn("Founding Member offer unavailable for public configuration");
    return closed;
  } finally {
    clearTimeout(timer);
  }
}

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = optionalEnv("SUPABASE_URL");
    const publishableKey = optionalEnv("SUPABASE_PUBLISHABLE_KEY");
    const turnstileSiteKey = optionalEnv("TURNSTILE_SITE_KEY");
    const managedAiAvailable = Boolean(
      optionalEnv("OPENAI_API_KEY") ||
      optionalEnv("AI_GATEWAY_API_KEY") ||
      optionalEnv("VERCEL_OIDC_TOKEN") ||
      optionalEnv("VERCEL"),
    );
    const founding = await publicFoundingOffer();
    return json(request, {
      proAvailable: Boolean(
        supabaseUrl &&
        publishableKey &&
        optionalEnv("SUPABASE_SERVICE_ROLE_KEY") &&
        optionalEnv("VIDEOLENS_EXTENSION_JWT_SECRET") &&
        turnstileSiteKey &&
        managedAiAvailable,
      ),
      checkoutAvailable: Boolean(
        optionalEnv("STRIPE_SECRET_KEY") &&
        optionalEnv("STRIPE_PRO_MONTHLY_PRICE_ID") &&
        optionalEnv("STRIPE_PRO_ANNUAL_PRICE_ID"),
      ),
      supabaseUrl,
      supabasePublishableKey: publishableKey,
      turnstileSiteKey,
      plans: {
        free: { managedReports: planConfig.freeManagedReports },
        pro: {
          managedReports: planConfig.proManagedReports,
          monthlyPriceUsd: planConfig.monthlyPriceUsd,
          annualPriceUsd: planConfig.annualPriceUsd,
        },
      },
      founding,
    });
  } catch (error) {
    return errorResponse(request, error);
  }
}

export default { fetch: handler };
