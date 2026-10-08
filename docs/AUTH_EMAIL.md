# VideoLens authentication email

Production uses Sovereign Mail's transactional API through the Supabase Auth
Send Email hook. The built-in Supabase email service permits only two messages
per hour across the project and must not be used for production sign-ins.

The hook is `auth-email-sovereign` in project `pjetrkwsypvyndqbxoth`. It verifies
Standard Webhooks signatures before preparing email, preserves the configured
account/ChatGPT consent redirects, and supplies branded HTML and plain text.
It returns success only after Sovereign Mail accepts the submission. Stable
idempotency keys prevent duplicate sends when Auth retries. No credentials,
recipients, authentication tokens, or email bodies are logged.

The VideoLens Authentication service application has only `transactional.send`
scope and the exact sender `support@astradevs.io`, displayed as **VideoLens**.
This existing verified Astra domain restores sign-ins without moving VideoLens
DNS or mail. A future `videolens.io` sender requires a verified sending route and
its own explicit grant before changing the From address.

## Limits and protections

- Supabase Auth: 100 emails/hour across the project.
- Sovereign Mail application: 30 submission attempts/minute, 1,000/day.
- Supabase's one-minute per-user resend interval and Turnstile remain enabled.
- Sovereign Mail verifies the live application, scope, sender grant and route
  for every submission. The key grants no access to mailboxes or inbox content.

## Deployment

Keep these values in Supabase Edge Function secrets, never in browser code or
source control:

- `VIDEOLENS_AUTH_EMAIL_HOOK_SECRET`: `v1,whsec_` followed by a random 32-byte
  base64 signing secret.
- `VIDEOLENS_SOVEREIGN_MAIL_API_KEY`: the dedicated scoped service credential.
- `VIDEOLENS_SOVEREIGN_MAIL_FROM_EMAIL`: the exact granted sender.

Deploy only this function:

```sh
supabase functions deploy auth-email-sovereign \
  --project-ref pjetrkwsypvyndqbxoth --no-verify-jwt --use-api
```

JWT verification is disabled because Supabase Auth authenticates the hook with
its own HMAC signature. Unsigned, modified and expired requests are rejected.

Use a targeted Management API patch to configure `hook_send_email_enabled`,
`hook_send_email_uri`, `hook_send_email_secrets`, and `rate_limit_email_sent`.
The hook URI is
`https://pjetrkwsypvyndqbxoth.supabase.co/functions/v1/auth-email-sovereign`.
The hook signing secret must match the Edge Function secret. Read current
settings first, retain a private rollback copy, then compare the readback to
ensure unrelated Auth settings were preserved.

Do not push local Auth defaults over production hook/SMTP settings. The hosted
hook secret and provider configuration are managed separately from local
`config.toml`. After any Auth configuration update, run:

```sh
node scripts/check-auth-email.mjs
```

This read-only check requires `SUPABASE_ACCESS_TOKEN` in the operator environment
and prints only non-secret readiness fields. It fails if the hook, production
quota, email provider, or CAPTCHA is missing.

## Verification

```sh
deno fmt --check supabase/functions/auth-email-sovereign
deno check --config supabase/functions/auth-email-sovereign/deno.json \
  supabase/functions/auth-email-sovereign/index.ts
deno test --config supabase/functions/auth-email-sovereign/deno.json \
  supabase/functions/auth-email-sovereign/handler_test.ts
```

Verify an unsigned live request returns 401 and the service application has
exactly one sender grant. Final verification requires a user-requested login
email, provider acceptance, inbox receipt, and a successful one-time login.
Request separate approval before sending an operator-generated test email.

This server-side repair benefits website sign-in and extension pairing in both
Chrome and Firefox. It changes no extension source or browser API behavior;
no extension version or store submission is required.

Reference: [Supabase Send Email hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).
