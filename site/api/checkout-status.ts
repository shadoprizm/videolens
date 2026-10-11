import type Stripe from "stripe";
import { authenticate } from "./_lib/auth.js";
import { getEntitlement } from "./_lib/entitlements.js";
import { optionalEnv } from "./_lib/env.js";
import { ApiError, errorResponse, json, options } from "./_lib/http.js";
import { proItem, stripeClient, syncCheckout, syncLatestInvoice, syncSubscription } from "./_lib/stripe.js";

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
  try {
    const user = await authenticate(request);
    if (user.source !== "website") throw new ApiError(403, "website_session_required", "Open your account to confirm checkout.");
    const id = new URL(request.url).searchParams.get("session") || "";
    if (!/^cs_[a-zA-Z0-9_]{8,200}$/.test(id)) throw new ApiError(400, "invalid_checkout", "Choose a valid checkout session.");
    const stripe = stripeClient();
    const checkout = await stripe.checkout.sessions.retrieve(id);
    if (checkout.mode !== "subscription" || (checkout.client_reference_id || checkout.metadata?.user_id) !== user.id) throw new ApiError(404, "checkout_not_found", "Checkout not found.");
    let subscription: Stripe.Subscription | null = null;
    if (checkout.subscription) {
      subscription = typeof checkout.subscription === "string" ? await stripe.subscriptions.retrieve(checkout.subscription) : checkout.subscription;
      if (!proItem(subscription) || (subscription.metadata.user_id && subscription.metadata.user_id !== user.id)) throw new ApiError(404, "checkout_not_found", "Checkout not found.");
    } else {
      const prices = [optionalEnv("STRIPE_PRO_MONTHLY_PRICE_ID"),optionalEnv("STRIPE_PRO_ANNUAL_PRICE_ID")].filter(Boolean);
      const items = await stripe.checkout.sessions.listLineItems(id);
      if (!items.data.some(item => item.price && prices.includes(item.price.id))) throw new ApiError(404, "checkout_not_found", "Checkout not found.");
    }
    if (subscription) {
      const linked = await syncSubscription(subscription);
      if (linked !== user.id) throw new ApiError(404, "checkout_not_found", "Checkout not found.");
      await syncLatestInvoice(subscription);
    }
    await syncCheckout(checkout, user.id);
    return json(request, { status: checkout.status, paymentStatus: checkout.payment_status, entitlement: await getEntitlement(user.id) });
  } catch (error) { return errorResponse(request, error); }
}
export default { fetch: handler };
