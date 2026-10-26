import { recordActivation } from "./activation.js";
import Stripe from "stripe";
import { optionalEnv, planConfig, requireEnv } from "./env.js";
import { ApiError } from "./http.js";
import { supabaseAdmin } from "./supabase.js";

let client: Stripe | null = null;

export function stripeClient(): Stripe {
  if (!client) client = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return client;
}

export function stripePermissionDenied(error:unknown):boolean {
  return Boolean(error && typeof error==="object" && "type" in error && error.type==="StripePermissionError");
}
export async function verifiedProPrice(billing:"monthly"|"annual"):Promise<string> {
  const id=requireEnv(billing==="monthly"?"STRIPE_PRO_MONTHLY_PRICE_ID":"STRIPE_PRO_ANNUAL_PRICE_ID");
  let price:Stripe.Price;
  try {price=await stripeClient().prices.retrieve(id);} catch(error) {
    // Existing restricted keys can create Checkout with configured immutable
    // price IDs while lacking Prices Read. Preserve that established flow.
    // The administrator audit reports this verification gap explicitly.
    if(stripePermissionDenied(error)) {console.warn("Configured checkout price used; Prices Read unavailable");return id;}
    throw error;
  }
  const product=optionalEnv("STRIPE_PRO_PRODUCT_ID");
  if(!price.active || price.currency!=="usd" || price.unit_amount!==(billing==="monthly"?1200:9900) || price.recurring?.interval!==(billing==="monthly"?"month":"year") || price.recurring.interval_count!==1 || (product && asId(price.product)!==product)) throw new ApiError(503,"billing_configuration_mismatch","Checkout is temporarily unavailable while we verify the plan price. Your reports remain available.");
  return id;
}

const mismatch = () => new ApiError(503,"billing_configuration_mismatch","Checkout is temporarily unavailable while we verify the plan price. Your reports remain available.");

export async function verifiedCreditPackPrice():Promise<string> {
  const id=requireEnv("STRIPE_CREDIT_PACK_PRICE_ID");
  let price:Stripe.Price;
  try {price=await stripeClient().prices.retrieve(id);} catch(error) {
    if(stripePermissionDenied(error)) {console.warn("Configured credit pack price used; Prices Read unavailable");return id;}
    throw error;
  }
  if(!price.active || price.currency!=="usd" || price.unit_amount!==planConfig.creditPackPriceCents || price.type!=="one_time") throw mismatch();
  return id;
}

export interface FoundingOffer { available: boolean; spotsLeft: number; spots: number; percentOff: number; endsAt: string }

// Fails closed: if the spot count cannot be read, the discount is not promised.
export async function foundingOffer(now = new Date()): Promise<FoundingOffer> {
  const offer = { available: false, spotsLeft: 0, spots: planConfig.foundingSpots, percentOff: planConfig.foundingPercentOff, endsAt: planConfig.foundingEndsAt };
  if (!optionalEnv("STRIPE_FOUNDING_COUPON_ID") || now.getTime() >= Date.parse(planConfig.foundingEndsAt)) return offer;
  const { count, error } = await supabaseAdmin().from("subscriptions").select("user_id", { count: "exact", head: true }).eq("founding_member", true);
  if (error || count === null) { console.warn("Founding Member count unavailable"); return offer; }
  const spotsLeft = Math.max(0, planConfig.foundingSpots - count);
  return { ...offer, available: spotsLeft > 0, spotsLeft };
}

export async function verifiedFoundingCoupon():Promise<string> {
  const id=requireEnv("STRIPE_FOUNDING_COUPON_ID");
  let coupon:Stripe.Coupon;
  try {coupon=await stripeClient().coupons.retrieve(id);} catch(error) {
    if(stripePermissionDenied(error)) {console.warn("Configured founding coupon used; Coupons Read unavailable");return id;}
    throw error;
  }
  if(!coupon.valid || coupon.percent_off!==planConfig.foundingPercentOff || coupon.duration!=="forever") throw mismatch();
  return id;
}

export function isCreditPackSession(session: Stripe.Checkout.Session): boolean {
  return session.mode === "payment" && session.metadata?.product === "videolens" && session.metadata?.kind === "credit_pack";
}

// Grants a paid pack exactly once per Checkout session; replays are no-ops.
export async function grantCreditPack(session: Stripe.Checkout.Session): Promise<string | null> {
  if (!isCreditPackSession(session) || session.payment_status !== "paid") return null;
  const userId = session.client_reference_id || session.metadata?.user_id;
  if (!userId) return null;
  const { error } = await supabaseAdmin().from("report_credit_grants").upsert({
    user_id: userId, stripe_session_id: session.id, credits: planConfig.creditPackReports,
    amount_total: session.amount_total, currency: session.currency,
  }, { onConflict: "stripe_session_id", ignoreDuplicates: true });
  if (error) throw error;
  return userId;
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
      founding_member: subscription.metadata.founding_member === "true",
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
  }, {
    onConflict: "stripe_session_id",
    // Creation can finish after a terminal webhook has already been stored.
    // Insert an open session once; never reopen a completed/expired checkout.
    ...(session.status === "open" || !session.status ? { ignoreDuplicates: true } : {}),
  });
  if (error) throw error;
}

export async function legacyCheckoutUser(session: Stripe.Checkout.Session): Promise<string | null> {
  // Before product markers were added, subscription sessions carried only a
  // user ID and billing interval. Match both the linked customer and our prices
  // so another product in this shared Stripe account cannot enter the ledger.
  if (session.mode !== "subscription" || session.metadata?.product) return null;
  const userId = session.client_reference_id || session.metadata?.user_id;
  const customerId = asId(session.customer);
  if (!userId || !customerId) return null;
  const { data, error } = await supabaseAdmin().from("profiles")
    .select("user_id").eq("stripe_customer_id", customerId).maybeSingle<{ user_id: string }>();
  if (error) throw error;
  if (data?.user_id !== userId) return null;
  const prices = [optionalEnv("STRIPE_PRO_MONTHLY_PRICE_ID"), optionalEnv("STRIPE_PRO_ANNUAL_PRICE_ID")].filter(Boolean);
  if (!prices.length) return null;
  const items = await stripeClient().checkout.sessions.listLineItems(session.id);
  return items.data.some(item => item.price && prices.includes(item.price.id)) ? userId : null;
}

export async function syncInvoice(invoice: Stripe.Invoice): Promise<void> {
  const legacy = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
  const reference = invoice.parent?.subscription_details?.subscription || legacy.subscription;
  if (!reference) return;
  const subscription = typeof reference === "string" ? await stripeClient().subscriptions.retrieve(reference) : reference;
  const userId = await syncSubscription(subscription);
  if (!userId) return;
  const paid = invoice.status === "paid";
  const { error } = await supabaseAdmin().rpc("record_payment_receipt", {
    p_invoice_id:invoice.id,p_user_id:userId,p_subscription_id:subscription.id,
    p_status:paid?"paid":"failed",p_amount_paid:invoice.amount_paid,p_currency:invoice.currency,
    p_paid_at:paid && invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at*1000).toISOString():null,
    p_created_at:new Date(invoice.created*1000).toISOString(),
  });
  if (error) throw error;
}

export async function syncLatestInvoice(subscription:Stripe.Subscription):Promise<void> {
  if(!subscription.latest_invoice) return;
  try {
    const invoice=typeof subscription.latest_invoice==="string"?await stripeClient().invoices.retrieve(subscription.latest_invoice):subscription.latest_invoice;
    if(invoice.status==="paid") await syncInvoice(invoice);
  } catch(error) {if(stripePermissionDenied(error)) {console.warn("Invoice backfill unavailable; signed invoice events remain authoritative");return;}throw error;}
}
