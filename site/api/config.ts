import { optionalEnv, planConfig } from "./_lib/env.js";
import { errorResponse, json, options } from "./_lib/http.js";

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = optionalEnv("SUPABASE_URL");
    const publishableKey = optionalEnv("SUPABASE_PUBLISHABLE_KEY");
    const managedAiAvailable = Boolean(
      optionalEnv("OPENAI_API_KEY") ||
      optionalEnv("AI_GATEWAY_API_KEY") ||
      optionalEnv("VERCEL_OIDC_TOKEN") ||
      optionalEnv("VERCEL"),
    );
    return json(request, {
      proAvailable: Boolean(
        supabaseUrl &&
        publishableKey &&
        optionalEnv("SUPABASE_SERVICE_ROLE_KEY") &&
        optionalEnv("VIDEOLENS_EXTENSION_JWT_SECRET") &&
        managedAiAvailable,
      ),
      checkoutAvailable: Boolean(
        optionalEnv("STRIPE_SECRET_KEY") &&
        optionalEnv("STRIPE_PRO_MONTHLY_PRICE_ID") &&
        optionalEnv("STRIPE_PRO_ANNUAL_PRICE_ID"),
      ),
      supabaseUrl,
      supabasePublishableKey: publishableKey,
      plans: {
        free: { managedReports: planConfig.freeManagedReports },
        pro: {
          managedReports: planConfig.proManagedReports,
          monthlyPriceUsd: planConfig.monthlyPriceUsd,
          annualPriceUsd: planConfig.annualPriceUsd,
        },
      },
    });
  } catch (error) {
    return errorResponse(request, error);
  }
}

export default { fetch: handler };
