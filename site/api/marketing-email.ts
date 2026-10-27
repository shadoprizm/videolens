import { optionalEnv } from "./_lib/env.js";
import { errorResponse, json } from "./_lib/http.js";
import { ANNOUNCEMENT_CUTOFF, dueCampaigns, marketingConfig, renderCampaign, sendMarketingEmail, type Campaign } from "./_lib/marketing.js";
import { foundingOffer } from "./_lib/stripe.js";
import { supabaseAdmin } from "./_lib/supabase.js";

// Sovereign Mail allows 30 submissions a minute; space sends to stay under it
// and stop well before the function time limit.
const SEND_SPACING_MS = 2_100;
const MAX_SENDS_PER_RUN = 120;
const RUN_BUDGET_MS = 270_000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function handler(request: Request, options: { spacingMs?: number } = {}): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  const secret = optionalEnv("CRON_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json(request, { error: "unauthorized" }, 401);
  try {
    const mode = optionalEnv("VIDEOLENS_MARKETING_MODE") || "off";
    if (mode !== "test" && mode !== "live") return json(request, { mode: "off", sent: 0 });
    const config = marketingConfig();
    const offer = await foundingOffer();
    const campaigns = dueCampaigns(offer);
    if (!campaigns.length) return json(request, { mode, sent: 0, reason: "offer_closed" });
    const spacing = options.spacingMs ?? SEND_SPACING_MS;
    const started = Date.now();
    const sent: Partial<Record<Campaign, number>> = {};

    if (mode === "test") {
      // Preview every due campaign to the owner only; nothing is recorded.
      const recipient = optionalEnv("VIDEOLENS_MARKETING_TEST_RECIPIENT");
      if (!recipient) return json(request, { error: "test_recipient_missing" }, 503);
      // Per-minute keys let a re-run after a copy change send a fresh preview.
      const stamp = new Date().toISOString().slice(0, 16);
      for (const campaign of campaigns) {
        const email = renderCampaign(campaign, { spotsLeft: offer.spotsLeft, unsubscribeToken: "preview", mailingAddress: config.mailingAddress });
        await sendMarketingEmail(config, recipient, { ...email, subject: `[Preview] ${email.subject}` }, `videolens.marketing.test.${campaign}.${stamp}`);
        sent[campaign] = 1;
        await pause(spacing);
      }
      return json(request, { mode, sent });
    }

    let total = 0;
    for (const campaign of campaigns) {
      const { data, error } = await supabaseAdmin().rpc("marketing_candidates", { p_campaign: campaign, p_cutoff: ANNOUNCEMENT_CUTOFF, p_limit: MAX_SENDS_PER_RUN - total });
      if (error) throw error;
      for (const member of (data || []) as { user_id: string; email: string; unsubscribe_token: string }[]) {
        if (total >= MAX_SENDS_PER_RUN || Date.now() - started > RUN_BUDGET_MS) return json(request, { mode, sent, more: true });
        const email = renderCampaign(campaign, { spotsLeft: offer.spotsLeft, unsubscribeToken: member.unsubscribe_token, mailingAddress: config.mailingAddress });
        // The provider deduplicates on this key, so a crash between sending
        // and recording cannot deliver the same campaign twice.
        const messageId = await sendMarketingEmail(config, member.email, email, `videolens.marketing.${campaign}.${member.user_id}`);
        const { error: recordError } = await supabaseAdmin().from("marketing_email_sends")
          .upsert({ user_id: member.user_id, campaign, message_id: messageId }, { onConflict: "user_id,campaign", ignoreDuplicates: true });
        if (recordError) throw recordError;
        sent[campaign] = (sent[campaign] || 0) + 1;
        total += 1;
        await pause(spacing);
      }
    }
    return json(request, { mode, sent, more: false });
  } catch (error) {
    return errorResponse(request, error);
  }
}

export default { fetch: (request: Request) => handler(request) };
