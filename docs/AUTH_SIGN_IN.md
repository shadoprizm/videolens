# VideoLens account sign-in

The account and OAuth consent pages share email/password authentication, signup,
password recovery, and social-provider buttons. Regular password sign-in sends no
email. New email accounts confirm their address once. Existing link-only users can
set a password while signed in or use password recovery, without recreating their
account or changing ownership of reports, subscriptions, or extension connections.
Email links remain an explicit existing-account fallback.

CAPTCHA remains required for password login, signup, recovery, and email-link
requests. OAuth providers validate their own sign-in. Password updates require an
authenticated Supabase session; the client never uses a service-role key. Password
fields are cleared after submission, and never stored or logged by VideoLens.

Provider availability comes from the project's public `/auth/v1/settings`, not
hard-coded buttons or client secrets. Only enabled Google, Apple, GitHub, and
Facebook providers appear. A failed provider-discovery request leaves password
authentication usable. Do not enable a provider until its production registration
is complete. An enabled flag alone is not end-to-end verification.

## Provider registration

All providers use this exact callback:

`https://pjetrkwsypvyndqbxoth.supabase.co/auth/v1/callback`

Homepage: `https://videolens.io`. Privacy: `https://videolens.io/privacy`.
Terms: `https://videolens.io/terms`. Support: `https://videolens.io/support`.
Register separate VideoLens clients; do not repurpose another product's branding or
credentials. Store provider secrets in hosted Supabase Auth settings only.

- **Google:** Web application client; origins `https://videolens.io` and
  `https://www.videolens.io`; exact callback above. External production audience.
  Identity scopes only: `openid`, email, profile. Configure VideoLens branding and
  authorized domain. [Current setup](https://supabase.com/docs/guides/auth/social-login/auth-google).
- **GitHub:** VideoLens OAuth app; exact callback, no wildcards, device flow off.
  Client requests only `read:user user:email`, never repository access.
  [Current setup](https://supabase.com/docs/guides/auth/social-login/auth-github).
- **Apple:** VideoLens App ID with Sign in with Apple, attached Services ID for
  web login, team ID, and signing key. Website domain
  `pjetrkwsypvyndqbxoth.supabase.co`, callback above. Register the sending domain and
  sender for Apple's private email relay. Web client secrets expire within six
  months; plan and verify rotation before enabling production login.
  [Current setup](https://supabase.com/docs/guides/auth/social-login/auth-apple).
- **Facebook:** VideoLens app with authentication use case, `public_profile` and
  `email`, exact callback, production/Live availability. Complete required privacy,
  data-deletion, and review steps in Meta's console before exposing the button.
  [Current setup](https://supabase.com/docs/guides/auth/social-login/auth-facebook).

## Redirects and existing users

Account login retains `connect` and `device` for both Chrome and Firefox extension
pairing. Social login and recovery on `/oauth/consent` retain the authorization ID.
Choosing a different consent account uses session storage and persists the choice
across redirects; it does not replace the normal account session. Recovery opens
password entry before the consent decision.

Supabase automatically links verified identities with the same email. Apple Hide
My Email or a provider using a different address can create a separate account;
never merge accounts or transfer paid access based on unverified user metadata.
Manual linking is not enabled by this release.

## Verification and release

Run `npm test --prefix site` plus the Auth email hook's Deno format, check, and
tests. Stage a production Vercel deployment without assigning domains. Inspect
desktop/mobile account and consent forms, then promote that tested deployment.
Verify each enabled provider through a real callback, signup confirmation,
password login, recovery, and existing-user continuity. Preserve CAPTCHA and the
Sovereign Mail hook. Never send operator-generated test mail without the owner's
explicit message approval.

Extension impact: the existing Chrome and Firefox packages open the same hosted
account page. This release changes hosted authentication only; no extension code,
manifest, permission, token contract, or package version changes. Both pairing
redirects are covered by hosted tests. No browser-store submission is needed.
