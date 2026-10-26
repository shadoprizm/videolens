import { recordActivation } from "./_lib/activation.js";
import { authenticate } from "./_lib/auth.js";
import { siteUrl } from "./_lib/env.js";
import { ApiError, errorResponse, json, options, readJson } from "./_lib/http.js";
import { getEntitlement } from "./_lib/entitlements.js";
import { foundingOffer, stripeClient, syncCheckout, verifiedCreditPackPrice, verifiedFoundingCoupon, verifiedProPrice } from "./_lib/stripe.js";
import { supabaseAdmin } from "./_lib/supabase.js";

interface CheckoutRequest {
  billing?: "monthly" | "annual";
  kind?: "credit_pack";
}

async function customerFor(userId: string): Promise<string> {
  const admin = supabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("stripe_customer_id,email")
    .eq("user_id", userId)
    .single<{ stripe_customer_id: string | null; email: string }>();
  if (profileError || !profile) throw profileError || new Error("Profile missing.");
  if (profile.stripe_customer_id) return profile.stripe_customer_id;
  const customer = await stripeClient().customers.create({ email: profile.email, metadata: { user_id: userId } });
  const { error: updateError } = await admin
    .from("profiles")
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (updateError) throw updateError;
  return customer.id;
}

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  try {
    const user = await authenticate(request);
    if (user.source !== "website") throw new ApiError(403, "website_session_required", "Open your VideoLens account to subscribe.");
    const body = await readJson<CheckoutRequest>(request, 10_000);
    const stripe = stripeClient();

    if (body.kind === "credit_pack") {
      const entitlement = await getEntitlement(user.id);
      if (entitlement.plan === "pro" && entitlement.hasBillingSubscription) {
        throw new ApiError(409, "already_subscribed", "Your Pro plan already includes 20 reports each calendar month.");
      }
      const priceId = await verifiedCreditPackPrice();
      const customerId = await customerFor(user.id);
      const marker = { user_id: user.id, product: "videolens", kind: "credit_pack" };
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        client_reference_id: user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${siteUrl()}/account?checkout=credits&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl()}/account?checkout=cancelled`,
        metadata: marker,
        payment_intent_data: { metadata: marker },
      });
      if (!session.url) throw new Error("Stripe Checkout did not return a URL.");
      try { await syncCheckout(session, user.id); } catch { console.warn("Checkout ledger unavailable"); }
      return json(request, { url: session.url });
    }

    if (body.billing !== "monthly" && body.billing !== "annual") {
      throw new ApiError(400, "invalid_billing_period", "Choose monthly or annual billing.");
    }

    const entitlement = await getEntitlement(user.id);
    if (entitlement.complimentary?.state === "pending" && !entitlement.hasBillingSubscription) {
      throw new ApiError(409, "complimentary_scan_required", "Complete your next successful managed scan to activate your free month before choosing a paid plan.");
    }
    if (!entitlement.canUpgrade) {
      throw new ApiError(409, "already_subscribed", "Use Manage billing to change your existing subscription.");
    }
    const priceId = await verifiedProPrice(body.billing);
    const coupon = (await foundingOffer()).available ? await verifiedFoundingCoupon() : null;
    const customerId = await customerFor(user.id);

    // Round upward to whole trial days so every remaining complimentary
    // hour is preserved, even when less than one day remains.
    const remainingMs = entitlement.complimentary?.state === "active"
      ? new Date(entitlement.complimentary.expiresAt!).getTime() - Date.now()
      : 0;
    const trialDays = remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 86_400_000)) : null;
    const founding: Record<string, string> = coupon ? { founding_member: "true" } : {};
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      // Stripe accepts either a fixed discount or customer-entered codes.
      ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
      success_url: `${siteUrl()}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/account?checkout=cancelled`,
      metadata: { user_id: user.id, billing: body.billing, product: "videolens", ...founding },
      subscription_data: {
        metadata: { user_id: user.id, ...founding, ...(trialDays ? { complimentary_conversion: "true" } : {}) },
        ...(trialDays ? {
          trial_period_days: trialDays,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } },
        } : {}),
      },
      ...(trialDays ? { custom_text: { submit: { message: `Your paid plan starts after ${trialDays} free days. Today's charge is $0. Cancel in Manage billing before the trial ends to avoid a charge.` } } } : {}),
    });
    if (!session.url) throw new Error("Stripe Checkout did not return a URL.");
    // Keep checkout usable if observational storage is temporarily unavailable.
    // Signed webhooks will retry durable reconciliation independently.
    try { await syncCheckout(session, user.id); } catch { console.warn("Checkout ledger unavailable"); }
    await recordActivation(user.id, "checkout_started", session.id);
    return json(request, { url: session.url });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing required environment variable")) {
      return json(request, { error: "checkout_not_configured", message: "Checkout is not live yet." }, 503);
    }
    return errorResponse(request, error);
  }
}

export default { fetch: handler };
