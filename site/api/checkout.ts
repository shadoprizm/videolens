import { authenticate } from "./_lib/auth.js";
import { optionalEnv, requireEnv, siteUrl } from "./_lib/env.js";
import { ApiError, errorResponse, json, options, readJson } from "./_lib/http.js";
import { stripeClient } from "./_lib/stripe.js";
import { supabaseAdmin } from "./_lib/supabase.js";

interface CheckoutRequest {
  billing?: "monthly" | "annual";
}

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  try {
    const user = await authenticate(request);
    if (user.source !== "website") throw new ApiError(403, "website_session_required", "Open your VideoLens account to subscribe.");
    const body = await readJson<CheckoutRequest>(request, 10_000);
    if (body.billing !== "monthly" && body.billing !== "annual") {
      throw new ApiError(400, "invalid_billing_period", "Choose monthly or annual billing.");
    }

    const admin = supabaseAdmin();
    const { data: existing } = await admin
      .from("subscriptions")
      .select("plan,status")
      .eq("user_id", user.id)
      .single<{ plan: string; status: string }>();
    if (existing?.plan === "pro" && ["active", "trialing"].includes(existing.status)) {
      throw new ApiError(409, "already_subscribed", "You already have an active Pro subscription.");
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("stripe_customer_id,email")
      .eq("user_id", user.id)
      .single<{ stripe_customer_id: string | null; email: string }>();
    if (profileError || !profile) throw profileError || new Error("Profile missing.");

    const stripe = stripeClient();
    let customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: profile.email, metadata: { user_id: user.id } });
      customerId = customer.id;
      const { error: updateError } = await admin
        .from("profiles")
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (updateError) throw updateError;
    }

    const priceId = body.billing === "monthly"
      ? requireEnv("STRIPE_PRO_MONTHLY_PRICE_ID")
      : requireEnv("STRIPE_PRO_ANNUAL_PRICE_ID");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${siteUrl()}/account?checkout=success`,
      cancel_url: `${siteUrl()}/account?checkout=cancelled`,
      metadata: { user_id: user.id, billing: body.billing },
      subscription_data: { metadata: { user_id: user.id } },
    });
    if (!session.url) throw new Error("Stripe Checkout did not return a URL.");
    return json(request, { url: session.url });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing required environment variable")) {
      return json(request, { error: "checkout_not_configured", message: "Pro checkout is not live yet." }, 503);
    }
    return errorResponse(request, error);
  }
}

export default { fetch: handler };
