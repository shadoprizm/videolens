import type Stripe from "stripe";
import { requireEnv } from "./_lib/env.js";
import { errorResponse, json } from "./_lib/http.js";
import { stripeClient, syncSubscription } from "./_lib/stripe.js";
import { supabaseAdmin } from "./_lib/supabase.js";

async function processEvent(event: Stripe.Event): Promise<void> {
  const stripe = stripeClient();
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await syncSubscription(event.data.object as Stripe.Subscription);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.user_id;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (userId && customerId) {
      await supabaseAdmin()
        .from("profiles")
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    }
    if (session.subscription) {
      const subscription = typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;
      await syncSubscription(subscription);
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
