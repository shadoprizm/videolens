import { authenticate } from "./_lib/auth.js";
import { ApiError, errorResponse, json, options } from "./_lib/http.js";
import { siteUrl } from "./_lib/env.js";
import { stripeClient } from "./_lib/stripe.js";
import { supabaseAdmin } from "./_lib/supabase.js";

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  try {
    const user = await authenticate(request);
    if (user.source !== "website") throw new ApiError(403, "website_session_required", "Open your VideoLens account to manage billing.");
    const { data, error } = await supabaseAdmin()
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single<{ stripe_customer_id: string | null }>();
    if (error) throw error;
    if (!data?.stripe_customer_id) throw new ApiError(404, "billing_account_missing", "No billing account was found.");
    const session = await stripeClient().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${siteUrl()}/account`,
    });
    return json(request, { url: session.url });
  } catch (error) {
    return errorResponse(request, error);
  }
}

export default { fetch: handler };
