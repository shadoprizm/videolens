import { Webhook } from "standardwebhooks";

export type Config = {
  hookSecret: string;
  apiKey: string;
  fromEmail: string;
  apiBaseUrl: string;
  supabaseUrl: string;
};
type EmailData = {
  email_action_type: string;
  token?: string;
  token_hash?: string;
  token_hash_new?: string;
  redirect_to?: string;
};
type Payload = {
  user: { email: string; new_email?: string };
  email_data: EmailData;
};
type Message = {
  to: { email: string }[];
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

function message(
  email: string,
  subject: string,
  instruction: string,
  link: string,
): Message {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new Error("Invalid recipient");
  }
  const text =
    `VideoLens\n\n${subject}\n\n${instruction}\n\n${link}\n\nThis link can only be used once and expires in one hour.\n\nIf you didn't request this email, you can safely ignore it.\n\nVideoLens · https://videolens.io`;
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${
      escapeHtml(subject)
    }</title></head><body style="margin:0;padding:0;background:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px"><tr><td style="padding:32px 24px"><p style="margin:0 0 28px;font-size:20px;font-weight:700;color:#0e7490">▶ VideoLens</p><h1 style="margin:0 0 18px;font-size:28px">${
      escapeHtml(subject)
    }</h1><p style="font-size:16px;line-height:1.6;color:#475569">${
      escapeHtml(instruction)
    }</p><p style="margin:28px 0"><a href="${
      escapeHtml(link)
    }" style="display:inline-block;background:#0891b2;color:#ffffff;padding:15px 23px;border-radius:9px;font-weight:700;text-decoration:none">Continue to VideoLens</a></p><p style="font-size:13px;line-height:1.6;color:#64748b">This link can only be used once and expires in one hour.</p><p style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:20px;font-size:13px;line-height:1.6;color:#64748b">If you didn't request this email, you can safely ignore it.</p></td></tr></table><p style="font-size:12px;color:#94a3b8">VideoLens · videolens.io</p></td></tr></table></body></html>`;
  return { to: [{ email }], subject, text, html };
}

export function prepareMessages(
  payload: Payload,
  supabaseUrl: string,
): Message[] {
  const { user, email_data: data } = payload;
  const redirect = new URL(data.redirect_to || "https://videolens.io/account");
  const accountOrigins = new Set([
    "https://videolens.io",
    "https://www.videolens.io",
    "https://videolens-site.vercel.app",
    "https://videolens-site-shadoprizms-projects.vercel.app",
  ]);
  const allowedAccount = accountOrigins.has(redirect.origin) &&
    redirect.pathname === "/account";
  const allowedConsent = redirect.origin === "https://videolens.io" &&
    redirect.pathname === "/oauth/consent";
  if (!allowedAccount && !allowedConsent) throw new Error("Untrusted redirect");
  const verificationLink = (hash: string | undefined, type: string) => {
    if (!hash || !/^[a-f0-9]{32,128}$/i.test(hash)) {
      throw new Error("Invalid token hash");
    }
    const url = new URL("/auth/v1/verify", supabaseUrl);
    if (url.origin !== "https://pjetrkwsypvyndqbxoth.supabase.co") {
      throw new Error("Invalid Auth origin");
    }
    url.searchParams.set("token", hash);
    url.searchParams.set("type", type);
    url.searchParams.set("redirect_to", redirect.toString());
    return url.toString();
  };
  switch (data.email_action_type) {
    case "signup":
    case "magiclink":
      return [
        message(
          user.email,
          "Your VideoLens sign-in link",
          "Use the button below to sign in to your VideoLens account.",
          verificationLink(data.token_hash, data.email_action_type),
        ),
      ];
    case "recovery":
      return [
        message(
          user.email,
          "Reset your VideoLens password",
          "Use the button below to reset your VideoLens password.",
          verificationLink(data.token_hash, "recovery"),
        ),
      ];
    case "invite":
      return [
        message(
          user.email,
          "Your VideoLens invitation",
          "Use the button below to accept your VideoLens invitation.",
          verificationLink(data.token_hash, "invite"),
        ),
      ];
    case "email_change": {
      if (!user.new_email) throw new Error("Missing new email");
      const messages = [
        message(
          user.new_email,
          "Confirm your VideoLens email address",
          "Confirm this email address for your VideoLens account.",
          verificationLink(data.token_hash, "email_change"),
        ),
      ];
      if (data.token_hash_new) {
        messages.unshift(
          message(
            user.email,
            "Confirm your VideoLens email change",
            "Confirm the requested change to your VideoLens email address.",
            verificationLink(data.token_hash_new, "email_change"),
          ),
        );
      }
      return messages;
    }
    case "reauthentication": {
      if (!data.token || !/^\d{6}$/.test(data.token)) {
        throw new Error("Invalid verification code");
      }
      return [{
        to: [{ email: user.email }],
        subject: "Your VideoLens verification code",
        text:
          `VideoLens\n\nYour verification code is ${data.token}.\n\nEnter this code in VideoLens to confirm your identity. It expires soon.\n\nIf you didn't request this email, you can safely ignore it.`,
        html:
          `<html lang="en"><body style="font-family:Arial,Helvetica,sans-serif"><h1>VideoLens</h1><h2>Your verification code</h2><p style="font-size:28px;font-weight:bold">${data.token}</p><p>Enter this code in VideoLens to confirm your identity. It expires soon.</p><p>If you didn't request this email, you can safely ignore it.</p></body></html>`,
      }];
    }
    default:
      throw new Error("Unsupported email action");
  }
}

const failure = (status: number, text: string) =>
  Response.json({ error: { http_code: status, message: text } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

type Transport = (
  url: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<Response>;

export function createHandler(config: Config, transport: Transport = fetch) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return failure(405, "Method not allowed");
    if (!config.hookSecret || !config.apiKey || !config.fromEmail) {
      return failure(503, "Email delivery is not configured");
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 100_000) {
      return failure(413, "Request too large");
    }
    let payload: Payload;
    try {
      payload = new Webhook(config.hookSecret.replace(/^v1,whsec_/, "")).verify(
        raw,
        Object.fromEntries(request.headers),
      ) as Payload;
    } catch {
      return failure(401, "Invalid webhook signature");
    }
    let messages: Message[];
    try {
      messages = prepareMessages(payload, config.supabaseUrl);
    } catch {
      return failure(422, "Invalid authentication email request");
    }
    for (const item of messages) {
      // Stable per token and recipient even when Auth retries with a new webhook ID.
      const digest = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(item)),
        ),
      );
      const key = `videolens.auth.${
        Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
          "",
        )
      }`;
      try {
        const response = await transport(
          `${config.apiBaseUrl}/api/v1/transactional/send`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${config.apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": key,
            },
            body: JSON.stringify({
              from: { email: config.fromEmail, name: "VideoLens" },
              ...item,
              metadata: { messageType: "authentication" },
            }),
            signal: AbortSignal.timeout(4_000),
          },
        );
        if (!response.ok) {
          return failure(503, "Email delivery is temporarily unavailable");
        }
        const result = await response.json();
        if (result.status !== "accepted" || typeof result.id !== "string") {
          return failure(503, "Email delivery was not accepted");
        }
      } catch {
        return failure(503, "Email delivery is temporarily unavailable");
      }
    }
    return Response.json({}, { headers: { "Cache-Control": "no-store" } });
  };
}
