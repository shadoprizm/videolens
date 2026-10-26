import Stripe from "stripe";

const secret = process.env.STRIPE_SECRET_KEY?.trim();
if (!secret) {
  console.error("Set STRIPE_SECRET_KEY to a Stripe test or live secret key before running this setup.");
  process.exit(1);
}

const stripe = new Stripe(secret);
const webhookArg = process.argv.find((arg) => arg.startsWith("--webhook-url="));
const webhookUrl = webhookArg?.slice("--webhook-url=".length) || null;

const products = await stripe.products.search({ query: "active:'true' AND metadata['videolens_plan']:'pro'" });
const product = products.data[0] || await stripe.products.create({
  name: "VideoLens Pro",
  description: "20 managed video-to-report analyses per calendar month, no OpenAI API key required, with optional cloud report storage.",
  metadata: { videolens_plan: "pro" },
});

const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
const monthly = prices.data.find((price) =>
  price.currency === "usd" && price.unit_amount === 1_200 && price.recurring?.interval === "month"
) || await stripe.prices.create({
  product: product.id,
  currency: "usd",
  unit_amount: 1_200,
  recurring: { interval: "month" },
  nickname: "VideoLens Pro Monthly",
});
const annual = prices.data.find((price) =>
  price.currency === "usd" && price.unit_amount === 9_900 && price.recurring?.interval === "year"
) || await stripe.prices.create({
  product: product.id,
  currency: "usd",
  unit_amount: 9_900,
  recurring: { interval: "year" },
  nickname: "VideoLens Pro Annual",
});

const packs = await stripe.products.search({ query: "active:'true' AND metadata['videolens_plan']:'credit_pack'" });
const pack = packs.data[0] || await stripe.products.create({
  name: "VideoLens Report Pack",
  description: "5 managed video-to-report analyses, no OpenAI API key required. Purchased reports never expire.",
  metadata: { videolens_plan: "credit_pack" },
});
const packPrices = await stripe.prices.list({ product: pack.id, active: true, limit: 100 });
const packPrice = packPrices.data.find((price) =>
  price.currency === "usd" && price.unit_amount === 500 && price.type === "one_time"
) || await stripe.prices.create({
  product: pack.id,
  currency: "usd",
  unit_amount: 500,
  nickname: "VideoLens Report Pack (5 reports)",
});

// Fixed ID so reruns reuse the coupon instead of creating duplicates.
const foundingCouponId = "videolens-founding-40";
let founding;
try { founding = await stripe.coupons.retrieve(foundingCouponId); } catch (error) {
  if (error?.code !== "resource_missing") throw error;
  founding = await stripe.coupons.create({
    id: foundingCouponId,
    name: "Founding Member (40% off for life)",
    percent_off: 40,
    duration: "forever",
    applies_to: { products: [product.id] },
  });
}

const webhookEvents = [
  "checkout.session.expired", "invoice.paid", "invoice.payment_failed",
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];
let webhookSecret = null;
if (webhookUrl) {
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const endpoint = existing.data.find((candidate) => candidate.url === webhookUrl);
  if (!endpoint) {
    const created = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: webhookEvents,
      description: "VideoLens Pro subscription entitlements",
    });
    webhookSecret = created.secret;
  } else if (!endpoint.enabled_events.includes("*")) {
    // Existing endpoints keep their signing secret; add any newly required
    // events so delayed report-pack payments still grant credits.
    const missing = webhookEvents.filter((event) => !endpoint.enabled_events.includes(event));
    if (missing.length) {
      await stripe.webhookEndpoints.update(endpoint.id, { enabled_events: [...endpoint.enabled_events, ...missing] });
      console.log(`Added webhook events: ${missing.join(", ")}`);
    }
  }
}

console.log(`STRIPE_PRO_PRODUCT_ID=${product.id}`);
console.log(`STRIPE_PRO_MONTHLY_PRICE_ID=${monthly.id}`);
console.log(`STRIPE_PRO_ANNUAL_PRICE_ID=${annual.id}`);
console.log(`STRIPE_CREDIT_PACK_PRICE_ID=${packPrice.id}`);
console.log(`STRIPE_FOUNDING_COUPON_ID=${founding.id}`);
if (webhookSecret) console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
if (webhookUrl && !webhookSecret) {
  console.log("Webhook endpoint already exists. Retrieve or rotate its signing secret in Stripe Workbench.");
}
