import { createHandler } from "./handler.ts";

Deno.serve(createHandler({
  hookSecret: Deno.env.get("VIDEOLENS_AUTH_EMAIL_HOOK_SECRET") ?? "",
  apiKey: Deno.env.get("VIDEOLENS_SOVEREIGN_MAIL_API_KEY") ?? "",
  fromEmail: Deno.env.get("VIDEOLENS_SOVEREIGN_MAIL_FROM_EMAIL") ?? "",
  apiBaseUrl: "https://app.mailsovereign.com",
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
}));
