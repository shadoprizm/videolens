import Stripe from "stripe";
import { optionalEnv, requireEnv } from "./env.js";
import { supabaseAdmin } from "./supabase.js";

let client: Stripe | null = null;

export function stripeClient(): Stripe {
  if (!client) client = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return client;
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

export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const customerId = asId(subscription.customer);
  if (!customerId) return;
  const userId = subscription.metadata.user_id || (await userIdForCustomer(customerId));
  if (!userId) return;

  const item = subscription.items.data[0];
  const priceId = item?.price?.id || null;
  const productId = asId(item?.price?.product || null);
  const expectedProduct = optionalEnv("STRIPE_PRO_PRODUCT_ID");
  const expectedPrices = [optionalEnv("STRIPE_PRO_MONTHLY_PRICE_ID"), optionalEnv("STRIPE_PRO_ANNUAL_PRICE_ID")]
    .filter(Boolean);
  const isProProduct = Boolean(
    (expectedProduct && productId === expectedProduct) || (priceId && expectedPrices.includes(priceId)),
  );
  const billingPeriod = period(subscription);

  const { error } = await supabaseAdmin().from("subscriptions").upsert(
    {
      user_id: userId,
      plan: isProProduct ? "pro" : "free",
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

  await supabaseAdmin()
    .from("profiles")
    .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}
