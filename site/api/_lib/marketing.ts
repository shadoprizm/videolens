import { optionalEnv, planConfig, siteUrl } from "./env.js";
import { ApiError } from "./http.js";
import type { FoundingOffer } from "./stripe.js";

export const CAMPAIGNS = ["founding_announcement", "founding_welcome", "founding_25_left", "founding_last_week"] as const;
export type Campaign = typeof CAMPAIGNS[number];

// Accounts created before midnight Toronto on 2026-10-27 receive the
// announcement; later accounts receive the welcome once they are a day old.
export const ANNOUNCEMENT_CUTOFF = "2026-10-27T04:00:00Z";
const REMINDER_SPOTS = 25;
// A full counter ("100 of 100 left") reads as no demand, so the live count
// appears only once this many spots are claimed. Never show invented numbers.
const COUNT_AFTER_CLAIMED = 10;

export function spotsLine(spotsLeft: number): string {
  const spots = planConfig.foundingSpots;
  return spots - spotsLeft < COUNT_AFTER_CLAIMED
    ? `Limited to the first ${spots} Pro members`
    : `${spotsLeft} of ${spots} founding spots left`;
}
const LAST_WEEK_MS = 7 * 86_400_000;

export function dueCampaigns(offer: FoundingOffer, now = new Date()): Campaign[] {
  if (!offer.available) return [];
  const due: Campaign[] = ["founding_announcement", "founding_welcome"];
  if (offer.spotsLeft <= REMINDER_SPOTS) due.push("founding_25_left");
  if (now.getTime() >= Date.parse(offer.endsAt) - LAST_WEEK_MS) due.push("founding_last_week");
  return due;
}

export interface MarketingConfig { apiKey: string; url: string; fromEmail: string; mailingAddress: string }

// Every value is required: a marketing-scoped key and endpoint, a granted
// sender, and the postal address CASL requires in each message.
const CONFIG_ENV = {
  apiKey: "VIDEOLENS_MARKETING_MAIL_API_KEY",
  url: "VIDEOLENS_MARKETING_MAIL_URL",
  fromEmail: "VIDEOLENS_MARKETING_FROM_EMAIL",
  mailingAddress: "VIDEOLENS_MAILING_ADDRESS",
} as const;

export function marketingConfig(): MarketingConfig {
  const missing = Object.values(CONFIG_ENV).filter((name) => !optionalEnv(name));
  if (missing.length) throw new ApiError(503, "marketing_not_configured", `Marketing email is not configured: ${missing.join(", ")}.`);
  return Object.fromEntries(Object.entries(CONFIG_ENV).map(([key, name]) => [key, optionalEnv(name)!])) as unknown as MarketingConfig;
}

export interface RenderedEmail { subject: string; preheader: string; html: string; text: string; unsubscribeUrl: string }

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (cents: number) => `US$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

export function unsubscribeUrl(token: string): string {
  return `${siteUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

interface Copy { subject: string; preheader: string; kicker: string; headline: string; intro: string; cta: string }

function copyFor(campaign: Campaign, spotsLeft: number): Copy {
  const spots = spotsLine(spotsLeft);
  switch (campaign) {
    case "founding_announcement": return {
      subject: "Become a VideoLens Founding Member: 40% off Pro for life",
      preheader: `${spots}. Plus, your free reports just went from 1 to 3.`,
      kicker: "Founding Member offer",
      headline: "Lock in 40% off VideoLens Pro, for life.",
      intro: "Thank you for being one of the first people to try VideoLens. To say thanks, the first 100 people who subscribe to Pro become Founding Members and keep 40% off for as long as they stay subscribed.",
      cta: "Claim my founding price",
    };
    case "founding_welcome": return {
      subject: "Welcome to VideoLens: 3 free reports and a founding offer",
      preheader: `Your first 3 reports are free. Founding Members also get 40% off Pro for life. ${spots}.`,
      kicker: "Welcome to VideoLens",
      headline: "Your first 3 reports are on us.",
      intro: "Turn any video into a report, lesson, or step-by-step guide with timestamped evidence. And while founding spots last, the first 100 people who subscribe to Pro keep 40% off for life.",
      cta: "Create my first report",
    };
    case "founding_25_left": return {
      subject: `Only ${spotsLeft} Founding Member spots left`,
      preheader: "40% off VideoLens Pro for life, for the first 100 subscribers only.",
      kicker: "Almost gone",
      headline: `Only ${spotsLeft} founding spots left.`,
      intro: "Founding Members keep 40% off VideoLens Pro for as long as they stay subscribed. Once the 100 spots are taken, the offer closes for good.",
      cta: "Claim my founding price",
    };
    case "founding_last_week": return {
      subject: "Last week to lock in 40% off VideoLens Pro for life",
      preheader: `The Founding Member offer ends December 31. ${spots}.`,
      kicker: "Final week",
      headline: "The founding offer ends December 31.",
      intro: "This is the last week to become a VideoLens Founding Member and keep 40% off Pro for as long as you stay subscribed. After December 31, Pro returns to the regular price.",
      cta: "Claim my founding price",
    };
  }
}

export function renderCampaign(campaign: Campaign, context: { spotsLeft: number; unsubscribeToken: string; mailingAddress: string }): RenderedEmail {
  const copy = copyFor(campaign, context.spotsLeft);
  const factor = (100 - planConfig.foundingPercentOff) / 100;
  const monthly = money(Math.round(planConfig.monthlyPriceUsd * 100 * factor));
  const annual = money(Math.round(planConfig.annualPriceUsd * 100 * factor));
  const cta = `${siteUrl()}/account?utm_source=email&utm_medium=email&utm_campaign=${campaign}`;
  const unsubscribe = unsubscribeUrl(context.unsubscribeToken);
  const address = context.mailingAddress;
  const pack = `${planConfig.creditPackReports} more reports for ${money(planConfig.creditPackPriceCents)}`;
  const included = [
    `${planConfig.proManagedReports} managed reports every calendar month, no API key needed`,
    "Reports, study lessons, and step-by-step guides with timestamped evidence",
    "Professional HTML and PDF exports",
    "Optional searchable cloud report library",
  ];

  const text = [
    copy.headline, "", copy.intro, "",
    `Monthly: ${monthly}/month (regularly US$${planConfig.monthlyPriceUsd})`,
    `Annual: ${annual}/year (regularly US$${planConfig.annualPriceUsd})`,
    `${spotsLine(context.spotsLeft)}. Offer ends December 31, 2026.`, "",
    `${copy.cta}: ${cta}`, "",
    "Pro includes:", ...included.map((item) => `- ${item}`), "",
    `Not ready to subscribe? Get ${pack}, one-time, no subscription. Purchased reports never expire.`, "",
    "You are receiving this because you created a VideoLens account.",
    `Unsubscribe from offer emails: ${unsubscribe}`,
    `VideoLens · ${address} · support@astradevs.io`,
  ].join("\n");

  const h = escapeHtml;
  const priceCard = (label: string, price: string, period: string, regular: string) =>
    `<td class="price" width="50%" style="padding:6px" valign="top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #c7d2fe;border-radius:14px;background:#ffffff"><tr><td style="padding:18px 16px;text-align:center;font-family:Arial,Helvetica,sans-serif"><div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b">${label}</div><div class="amount" style="margin-top:8px;font-size:30px;font-weight:800;color:#0f172a">${price}<span style="font-size:14px;font-weight:600;color:#64748b">/${period}</span></div><div style="margin-top:4px;font-size:13px;color:#94a3b8;text-decoration:line-through">${regular}</div></td></tr></table></td>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${h(copy.subject)}</title><style>@media (max-width:520px){.price{display:block!important;width:100%!important;box-sizing:border-box}.amount{font-size:26px!important}.headline{font-size:25px!important}.pad{padding-left:20px!important;padding-right:20px!important}}</style></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${h(copy.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 14px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;color:#0f172a">Video<span style="color:#0891b2">Lens</span></td></tr>
<tr><td style="border-radius:20px;overflow:hidden;background:#ffffff;box-shadow:0 10px 30px rgba(15,23,42,.08)">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td class="pad" style="background:#0891b2;background-image:linear-gradient(135deg,#0891b2,#4f46e5);padding:36px 32px;font-family:Arial,Helvetica,sans-serif;color:#ffffff">
<div style="display:inline-block;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.18);font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${h(copy.kicker)}</div>
<h1 class="headline" style="margin:16px 0 0;font-size:30px;line-height:1.2;font-weight:800">${h(copy.headline)}</h1>
</td></tr>
<tr><td class="pad" style="padding:28px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334155">${h(copy.intro)}</td></tr>
<tr><td style="padding:10px 26px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${priceCard("Monthly", monthly, "month", `US$${planConfig.monthlyPriceUsd}/month`)}${priceCard("Annual", annual, "year", `US$${planConfig.annualPriceUsd}/year`)}</tr></table></td></tr>
<tr><td align="center" style="padding:14px 32px 0;font-family:Arial,Helvetica,sans-serif"><span style="display:inline-block;padding:7px 14px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:13px;font-weight:700">${h(spotsLine(context.spotsLeft))} · ends December 31, 2026</span></td></tr>
<tr><td align="center" style="padding:24px 32px 6px"><a href="${h(cta)}" style="display:inline-block;background:#0891b2;color:#ffffff;padding:16px 30px;border-radius:12px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;text-decoration:none">${h(copy.cta)}</a></td></tr>
<tr><td align="center" style="padding:0 32px 22px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8">The founding price is applied automatically at checkout.</td></tr>
<tr><td style="padding:0 32px"><div style="border-top:1px solid #e2e8f0"></div></td></tr>
<tr><td style="padding:22px 32px 6px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0f172a">Pro includes</td></tr>
<tr><td style="padding:0 32px 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#475569">${included.map((item) => `<div style="padding:4px 0"><span style="color:#059669;font-weight:700">✓</span>&nbsp; ${h(item)}</div>`).join("")}</td></tr>
<tr><td style="padding:12px 32px 30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px"><tr><td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#475569"><strong style="color:#0f172a">Not ready to subscribe?</strong> Get ${h(pack)}, one-time, no subscription. Purchased reports never expire.</td></tr></table></td></tr>
</table></td></tr>
<tr><td style="padding:22px 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#94a3b8;text-align:center">
You are receiving this because you created a VideoLens account.<br>
<a href="${h(unsubscribe)}" style="color:#64748b;text-decoration:underline">Unsubscribe from offer emails</a> · Sign-in and receipt emails are not affected.<br>
VideoLens · ${h(address)} · support@astradevs.io
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: copy.subject, preheader: copy.preheader, html, text, unsubscribeUrl: unsubscribe };
}

export async function sendMarketingEmail(config: MarketingConfig, to: string, email: RenderedEmail, idempotencyKey: string): Promise<string> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      from: { email: config.fromEmail, name: "VideoLens" },
      to: [{ email: to }],
      subject: email.subject, text: email.text, html: email.html,
      // Gives Gmail and Apple Mail their built-in unsubscribe button; the
      // endpoint accepts the RFC 8058 one-click POST.
      headers: { "List-Unsubscribe": `<${email.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      // Sovereign Mail accepts only these two metadata keys and rejects others.
      metadata: { messageType: "marketing", applicationMessageId: idempotencyKey },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json().catch(() => ({})) as { status?: string; id?: string };
  if (!response.ok || result.status !== "accepted" || typeof result.id !== "string") {
    throw new ApiError(502, "marketing_send_rejected", `Email provider rejected the message (HTTP ${response.status}).`);
  }
  return result.id;
}
