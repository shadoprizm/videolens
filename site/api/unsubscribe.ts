import { supabaseAdmin } from "./_lib/supabase.js";

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} · VideoLens</title>
<style>body{margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a}main{max-width:480px;margin:48px auto;padding:32px;background:#fff;border-radius:18px;box-shadow:0 10px 30px rgba(15,23,42,.08)}h1{margin:0 0 12px;font-size:24px}p{color:#475569;line-height:1.6}button{border:0;border-radius:10px;background:#0891b2;color:#fff;font-size:15px;font-weight:700;padding:13px 22px;cursor:pointer}a{color:#0891b2}.brand{font-weight:800;margin-bottom:20px}.brand span{color:#0891b2}</style></head>
<body><main><div class="brand">Video<span>Lens</span></div><h1>${title}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

const done = () => page("You're unsubscribed", "<p>You won't receive VideoLens offer emails anymore. Sign-in and receipt emails still arrive so you can use your account.</p><p><a href=\"https://videolens.io/account\">Back to your account</a></p>");

export async function handler(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (token === "preview") return page("Unsubscribe preview", "<p>This link comes from a preview email, so no account was changed.</p>");
  if (!TOKEN.test(token)) return page("Link not recognised", "<p>This unsubscribe link is incomplete. Use the link from the bottom of the email, or contact support@astradevs.io.</p>", 400);

  if (request.method === "GET") {
    // A confirmation step stops mail scanners that prefetch links from
    // unsubscribing people; mail clients use the POST below directly.
    return page("Unsubscribe from offer emails?", `<p>You'll stop receiving VideoLens offers such as the Founding Member price. Sign-in and receipt emails are not affected.</p><form method="post" action="/unsubscribe?token=${token}"><button type="submit">Unsubscribe</button></form>`);
  }
  if (request.method !== "POST") return page("Not allowed", "<p>Use the link from the email.</p>", 405);

  const { error } = await supabaseAdmin().from("marketing_preferences")
    .update({ opted_out_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .is("opted_out_at", null);
  if (error) return page("Please try again", "<p>We couldn't update your preferences just now. Please try the link again in a minute, or contact support@astradevs.io.</p>", 503);
  // The same response for unknown tokens avoids revealing which links exist.
  return done();
}

export default { fetch: handler };
