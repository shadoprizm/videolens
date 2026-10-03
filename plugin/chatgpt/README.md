# VideoLens ChatGPT plugin

This package connects ChatGPT to reports that a VideoLens user explicitly saved in the cloud library. The MCP endpoint is `https://videolens.io/api/mcp`. It is read-only and does not start new video analysis, access local-only reports, manage billing, or delete content.

## Server and authentication

- `site/api/mcp.ts` serves Streamable HTTP MCP and requires an OAuth bearer token on every request.
- `site/api/oauth-protected-resource.ts` advertises the Supabase OAuth issuer.
- `site/oauth-consent.html` shows the requesting client, requested scopes, account data access, and approve/deny actions.
- The migration `20261003223515_restrict_oauth_client_data_access.sql` blocks OAuth tokens from direct PostgREST access to profiles, subscriptions, and reports, including deletion. First-party browser tokens retain their current access. The MCP API reads only `cloud_saved=true`, `status=complete` reports for the verified user.
- The custom access-token hook binds OAuth tokens to the MCP URL in their `aud` claim; regular browser tokens keep their normal audience.
- Users can revoke connected OAuth clients at `/account`.

Supabase production Auth needs these targeted settings after the site release: `oauth_server_enabled=true`, `oauth_server_allow_dynamic_registration=true`, `oauth_server_authorization_path=/oauth/consent`, `hook_custom_access_token_enabled=true`, `hook_custom_access_token_uri=pg-functions://postgres/public/videolens_access_token_hook`, and an allowlisted magic-link redirect for `https://videolens.io/oauth/consent**`. Change only these fields in the live Auth configuration; pushing the entire local `config.toml` could overwrite unrelated production settings.

## Review package

`plugin.json` holds the public listing and five positive and three negative review cases. `mcp.json` points to the one production server. Icons are copied from the existing VideoLens site. The review account credentials and instructions belong in the secure OpenAI dashboard form, never in the ZIP or repository. Add the verified demo recording URL after running the scenarios against the live connection, then rebuild the ZIP from this directory's `plugin.json`, `mcp.json`, and `assets/`.

The package uses the verified individual developer identity currently available in the OpenAI dashboard, Jeramy Adam Ratelle. The app display name remains VideoLens. Confirm country availability in the dashboard before submission. Do not label a draft upload, scan, or passing local test as a completed review submission.

This site-only release does not change `extension/`; it has no Chrome or Firefox extension release impact.
