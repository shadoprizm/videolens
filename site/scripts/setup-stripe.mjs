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

let webhookSecret = null;
if (webhookUrl) {
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const endpoint = existing.data.find((candidate) => candidate.url === webhookUrl);
  if (!endpoint) {
    const created = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: [
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ],
      description: "VideoLens Pro subscription entitlements",
    });
    webhookSecret = created.secret;
  }
}

console.log(`STRIPE_PRO_PRODUCT_ID=${product.id}`);
console.log(`STRIPE_PRO_MONTHLY_PRICE_ID=${monthly.id}`);
console.log(`STRIPE_PRO_ANNUAL_PRICE_ID=${annual.id}`);
if (webhookSecret) console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
if (webhookUrl && !webhookSecret) {
  console.log("Webhook endpoint already exists. Retrieve or rotate its signing secret in Stripe Workbench.");
}
