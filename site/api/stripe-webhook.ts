import type Stripe from "stripe";
import { requireEnv } from "./_lib/env.js";
import { errorResponse, json } from "./_lib/http.js";
import { grantCreditPack, isCreditPackSession, legacyCheckoutUser, stripeClient, syncSubscription, syncCheckout, syncInvoice, syncLatestInvoice } from "./_lib/stripe.js";
import { supabaseAdmin } from "./_lib/supabase.js";

export async function processEvent(event: Stripe.Event): Promise<void> {
  const stripe = stripeClient();
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await syncSubscription(event.data.object as Stripe.Subscription);
    return;
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    // Signature-verified payloads need no new invoice-read permission. The
    // durable ledger prevents an older failure overwriting a paid invoice.
    await syncInvoice(event.data.object as Stripe.Invoice);
    return;
  }
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.user_id;
    if (isCreditPackSession(session)) {
      // Only paid sessions grant credits; expired or unpaid ones are ledgered.
      await grantCreditPack(session);
      if (userId) await syncCheckout(session, userId);
    } else if (session.subscription) {
      const subscription = typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;
      const linkedUser = await syncSubscription(subscription);
      if (linkedUser) await syncCheckout(session, linkedUser);
      if (linkedUser) await syncLatestInvoice(subscription);
    } else if (userId && session.metadata?.product === "videolens") {
      // Sessions created by this endpoint carry an explicit product marker.
      await syncCheckout(session, userId);
    } else {
      const legacyUserId = await legacyCheckoutUser(session);
      if (legacyUserId) await syncCheckout(session, legacyUserId);
    }
  }
}

export async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  const admin = supabaseAdmin();
  let eventId: string | null = null;
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) return json(request, { error: "missing_signature" }, 400);
    const rawBody = await request.text();
    const event = stripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET"),
    );
    eventId = event.id;

    const { data: claimed, error: claimError } = await admin
      .from("stripe_events")
      .insert({ event_id: event.id, event_type: event.type })
      .select("event_id")
      .maybeSingle<{ event_id: string }>();
    if (claimError?.code === "23505") return json(request, { received: true, duplicate: true });
    if (claimError || !claimed) throw claimError || new Error("Could not claim Stripe event.");

    await processEvent(event);
    return json(request, { received: true });
  } catch (error) {
    if (eventId) await admin.from("stripe_events").delete().eq("event_id", eventId);
    if (error instanceof Error && error.message.toLowerCase().includes("signature")) {
      return json(request, { error: "invalid_signature" }, 400);
    }
    return errorResponse(request, error);
  }
}

export default { fetch: handler };
