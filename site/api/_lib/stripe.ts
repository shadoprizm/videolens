import { recordActivation } from "./activation.js";
import Stripe from "stripe";
import { optionalEnv, requireEnv } from "./env.js";
import { ApiError } from "./http.js";
import { supabaseAdmin } from "./supabase.js";

let client: Stripe | null = null;

export function stripeClient(): Stripe {
  if (!client) client = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return client;
}

export async function verifiedProPrice(billing:"monthly"|"annual"):Promise<string> {
  const id=requireEnv(billing==="monthly"?"STRIPE_PRO_MONTHLY_PRICE_ID":"STRIPE_PRO_ANNUAL_PRICE_ID");
  const price=await stripeClient().prices.retrieve(id);
  const product=optionalEnv("STRIPE_PRO_PRODUCT_ID");
  if(!price.active || price.currency!=="usd" || price.unit_amount!==(billing==="monthly"?1200:9900) || price.recurring?.interval!==(billing==="monthly"?"month":"year") || price.recurring.interval_count!==1 || (product && asId(price.product)!==product)) throw new ApiError(503,"billing_configuration_mismatch","Checkout is temporarily unavailable while we verify the plan price. Your reports remain available.");
  return id;
}

function asId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function period(subscription: Stripe.Subscription): { start: string | null; end: string | null } {
  const candidate = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const item = subscription.items.data[0] as Stripe.SubscriptionItem & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const start = candidate.current_period_start ?? item?.current_period_start;
  const end = candidate.current_period_end ?? item?.current_period_end;
  return {
    start: start ? new Date(start * 1000).toISOString() : null,
    end: end ? new Date(end * 1000).toISOString() : null,
  };
}

async function userIdForCustomer(customerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("profiles")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle<{ user_id: string }>();
  return data?.user_id || null;
}

export function proItem(subscription: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  const product = optionalEnv("STRIPE_PRO_PRODUCT_ID");
  const prices = [optionalEnv("STRIPE_PRO_MONTHLY_PRICE_ID"), optionalEnv("STRIPE_PRO_ANNUAL_PRICE_ID")].filter(Boolean);
  return subscription.items.data.find(item => prices.length ? prices.includes(item.price.id) : Boolean(product && asId(item.price.product) === product));
}

export async function syncSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  // Shared Stripe accounts send events for other products. Ignore them before
  // touching either the profile or access record.
  const item = proItem(subscription);
  if (!item) return null;
  const customerId = asId(subscription.customer);
  if (!customerId) return null;
  const userId = subscription.metadata.user_id || (await userIdForCustomer(customerId));
  if (!userId) return null;
  const priceId = item?.price?.id || null;
  const productId = asId(item?.price?.product || null);
  const billingPeriod = period(subscription);

  const { error } = await supabaseAdmin().from("subscriptions").upsert(
    {
      user_id: userId,
      plan: "pro",
      status: subscription.status,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_product_id: productId,
      stripe_price_id: priceId,
      current_period_start: billingPeriod.start,
      current_period_end: billingPeriod.end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  if (subscription.status === "active") {
    await recordActivation(userId, "subscription_active", subscription.id);
  }

  const { error: profileError } = await supabaseAdmin()
    .from("profiles")
    .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (profileError) throw profileError;
  return userId;
}

export async function syncCheckout(session: Stripe.Checkout.Session, userId: string): Promise<void> {
  const { error } = await supabaseAdmin().from("checkout_sessions").upsert({
    stripe_session_id: session.id, user_id: userId,
    billing: session.metadata?.billing === "annual" ? "annual" : session.metadata?.billing === "monthly" ? "monthly" : null,
    status: session.status || "open", payment_status: session.payment_status,
    amount_total: session.amount_total, currency: session.currency,
    created_at: new Date(session.created * 1000).toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_session_id" });
  if (error) throw error;
}

export async function syncInvoice(invoice: Stripe.Invoice): Promise<void> {
  const legacy = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
  const reference = invoice.parent?.subscription_details?.subscription || legacy.subscription;
  if (!reference) return;
  const subscription = typeof reference === "string" ? await stripeClient().subscriptions.retrieve(reference) : reference;
  const userId = await syncSubscription(subscription);
  if (!userId) return;
  const paid = invoice.status === "paid";
  const { error } = await supabaseAdmin().from("payment_receipts").upsert({
    stripe_invoice_id: invoice.id, user_id: userId, stripe_subscription_id: subscription.id,
    status: paid ? "paid" : "failed", amount_paid: invoice.amount_paid, currency: invoice.currency,
    paid_at: paid && invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null,
    created_at: new Date(invoice.created * 1000).toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_invoice_id" });
  if (error) throw error;
}
