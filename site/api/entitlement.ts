import { authenticate } from "./_lib/auth.js";
import { getEntitlement } from "./_lib/entitlements.js";
import { optionalEnv, planConfig } from "./_lib/env.js";
import { errorResponse, json, options } from "./_lib/http.js";
import { foundingOffer } from "./_lib/stripe.js";

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
  try {
    const user = await authenticate(request);
    const [entitlement, founding] = await Promise.all([getEntitlement(user.id), foundingOffer()]);
    return json(request, {
      user: { id: user.id, email: user.email, isAdministrator: user.isAdministrator },
      entitlement,
      offers: {
        founding,
        creditPack: {
          available: Boolean(optionalEnv("STRIPE_SECRET_KEY") && optionalEnv("STRIPE_CREDIT_PACK_PRICE_ID")),
          reports: planConfig.creditPackReports,
          priceUsd: planConfig.creditPackPriceCents / 100,
        },
      },
    });
  } catch (error) {
    return errorResponse(request, error);
  }
}

export default { fetch: handler };
