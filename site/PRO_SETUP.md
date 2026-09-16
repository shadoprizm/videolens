# VideoLens Pro production setup

The code is fail-closed: without these services, `/account` shows a setup notice and the extension's Private / BYOK mode continues to work.

## 1. Supabase

Create a dedicated VideoLens project in the `ca-central-1` region, then apply:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

The migration under `../supabase/migrations/` creates account, subscription, report, request-metering, Stripe-event, and extension-pairing tables. Every public table has RLS enabled. Privileged quota functions are executable only by `service_role`.

In Supabase Auth URL Configuration:

- Site URL: `https://videolens.io`
- Redirect URL: `https://videolens.io/account**`
- Preview redirect for testing: the exact Vercel preview `/account**` URL

Use the project's modern publishable key for `SUPABASE_PUBLISHABLE_KEY`; never put the service-role key in browser or extension code.

## 2. Stripe

Use Stripe test mode first:

```bash
cd site
STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup -- \
  --webhook-url=https://videolens.io/api/stripe-webhook
```

The script reuses or creates:

- VideoLens Pro monthly: US$12/month
- VideoLens Pro annual: US$99/year
- Webhook events for Checkout completion and subscription create/update/delete

Copy the printed product, price, and webhook IDs into Vercel. Configure Stripe's Customer Portal to let users update payment methods and cancel subscriptions. Repeat deliberately with a live secret only after the complete test-mode purchase, renewal-status, cancellation, and webhook flows pass.

## 3. Vercel environment

Set every required value shown in `.env.example` for Production and Preview. Generate the extension token secret with at least 32 random characters. Production managed analysis uses Vercel AI Gateway with the deployment's automatic OIDC identity, so no OpenAI key is required. `AI_GATEWAY_API_KEY` supports local/non-Vercel environments and `OPENAI_API_KEY` remains an optional direct-provider fallback. Private mode never touches any server-managed credential.

The public account configuration endpoint exposes only the Supabase URL, publishable key, plan facts, and feature-availability booleans. It never exposes Stripe, Gateway, OpenAI, service-role, or JWT secrets.

## 4. Deploy and verify

```bash
cd site
npm test
npx vercel build
npx vercel deploy --prebuilt
```

Verify in this order:

1. Passwordless sign-in at `/account`.
2. One-time extension pairing and 30-day limited extension token.
3. Free account's single managed starter report.
4. Monthly and annual Stripe test checkout.
5. Webhook changes entitlement to Pro.
6. Managed report without an OpenAI key.
7. Cloud saving off leaves no report JSON in the database.
8. Cloud saving on adds the completed report to `/account`; deletion removes it.
9. Cancellation through Stripe Customer Portal updates the entitlement.
10. Private / BYOK mode still works if the Pro API is unavailable.

## 5. Chrome Web Store update

Version 0.3.0 adds an optional `https://videolens.io/*` host permission. Update the Privacy declarations and permission justifications from `../extension/STORE_LISTING.md`, upload the new package, and submit the update for review only after production verification.
