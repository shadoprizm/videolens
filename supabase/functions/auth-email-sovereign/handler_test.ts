import { Webhook } from "standardwebhooks";
import { type Config, createHandler, prepareMessages } from "./handler.ts";

const secret = btoa("a".repeat(32));
const config: Config = {
  hookSecret: `v1,whsec_${secret}`,
  apiKey: "test-key",
  fromEmail: "support@astradevs.io",
  apiBaseUrl: "https://app.mailsovereign.com",
  supabaseUrl: "https://pjetrkwsypvyndqbxoth.supabase.co",
};
const payload = {
  user: { email: "owner@example.com" },
  email_data: {
    email_action_type: "magiclink",
    token_hash: "b".repeat(64),
    redirect_to: "https://videolens.io/account?connect=test&device=test",
  },
};

Deno.test("existing website, deployment, and ChatGPT consent redirects remain supported", () => {
  for (
    const redirect_to of [
      "https://www.videolens.io/account",
      "https://videolens-site.vercel.app/account",
      "https://videolens-site-shadoprizms-projects.vercel.app/account",
      "https://videolens.io/oauth/consent?client=test",
    ]
  ) {
    const result = prepareMessages({
      ...payload,
      email_data: { ...payload.email_data, redirect_to },
    }, config.supabaseUrl);
    const link = result[0].text.match(
      /https:\/\/pjetrkwsypvyndqbxoth\.supabase\.co\/[^\s]+/,
    )![0];
    assert(new URL(link).searchParams.get("redirect_to") === redirect_to);
  }
});

Deno.test("reauthentication delivers the verification code without an unusable verification link", () => {
  const result = prepareMessages({
    ...payload,
    email_data: {
      ...payload.email_data,
      email_action_type: "reauthentication",
      token: "123456",
    },
  }, config.supabaseUrl);
  assert(
    result[0].text.includes("123456") && result[0].html.includes("123456"),
  );
});
function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}
function request(body: unknown = payload, timestamp = new Date()) {
  const raw = JSON.stringify(body);
  return new Request("https://example.com", {
    method: "POST",
    body: raw,
    headers: {
      "webhook-id": "msg_test",
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": new Webhook(secret).sign("msg_test", timestamp, raw),
    },
  });
}

Deno.test("signed login preserves pairing redirect, branded MIME bodies, and retry key", async () => {
  const sent: { headers: Headers; body: Record<string, unknown> }[] = [];
  const handler = createHandler(config, (_url, options) => {
    sent.push({
      headers: new Headers(options?.headers),
      body: JSON.parse(String(options?.body)),
    });
    return Promise.resolve(
      Response.json({ id: "msg_accepted", status: "accepted" }),
    );
  });
  assert((await handler(request())).status === 200);
  assert((await handler(request())).status === 200);
  assert(
    sent.length === 2 &&
      sent[0].headers.get("Idempotency-Key") ===
        sent[1].headers.get("Idempotency-Key"),
  );
  assert(sent[0].headers.get("Authorization") === "Bearer test-key");
  assert(
    JSON.stringify(sent[0].body.from) ===
      JSON.stringify({ email: config.fromEmail, name: "VideoLens" }),
  );
  assert(String(sent[0].body.html).includes("VideoLens"));
  const link = String(sent[0].body.text).match(
    /https:\/\/pjetrkwsypvyndqbxoth\.supabase\.co\/[^\s]+/,
  )![0];
  assert(
    new URL(link).searchParams.get("redirect_to") ===
      payload.email_data.redirect_to,
  );
  assert(
    new URL(link).searchParams.get("token") === payload.email_data.token_hash,
  );
});

Deno.test("unsigned, tampered, and expired webhooks cannot send", async () => {
  let calls = 0;
  const handler = createHandler(config, () => {
    calls++;
    return Promise.resolve(Response.json({ status: "accepted", id: "test" }));
  });
  assert(
    (await handler(
      new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    )).status === 401,
  );
  const signed = request();
  assert(
    (await handler(
      new Request(signed.url, {
        method: "POST",
        headers: signed.headers,
        body: JSON.stringify({
          ...payload,
          user: { email: "attacker@example.com" },
        }),
      }),
    )).status === 401,
  );
  assert(
    (await handler(request(payload, new Date(Date.now() - 600_000)))).status ===
      401,
  );
  assert(calls === 0);
});

Deno.test("provider failure or malformed acceptance cannot report success", async () => {
  for (
    const response of [
      Response.json({ error: "private provider diagnostics" }, { status: 429 }),
      Response.json({ status: "queued" }),
    ]
  ) {
    const result = await createHandler(config, () => Promise.resolve(response))(
      request(),
    );
    assert(
      result.status === 503 &&
        !(await result.text()).includes("private provider"),
    );
  }
});

Deno.test("foreign redirects, foreign Auth projects, and unknown actions cannot send", async () => {
  let calls = 0;
  const transport = () => {
    calls++;
    return Promise.resolve(Response.json({ status: "accepted", id: "test" }));
  };
  assert(
    (await createHandler(config, transport)(
      request({
        ...payload,
        email_data: {
          ...payload.email_data,
          redirect_to: "https://attacker.example/account",
        },
      }),
    )).status === 422,
  );
  assert(
    (await createHandler({
      ...config,
      supabaseUrl: "https://other.supabase.co",
    }, transport)(request())).status === 422,
  );
  assert(
    (await createHandler(config, transport)(
      request({
        ...payload,
        email_data: { ...payload.email_data, email_action_type: "unexpected" },
      }),
    )).status === 422,
  );
  assert(calls === 0);
});

Deno.test("signup, recovery, invitation, and email changes match recipient and token", () => {
  for (const action of ["signup", "recovery", "invite"]) {
    const result = prepareMessages({
      ...payload,
      email_data: { ...payload.email_data, email_action_type: action },
    }, config.supabaseUrl);
    assert(
      new URL(
        result[0].text.match(
          /https:\/\/pjetrkwsypvyndqbxoth\.supabase\.co\/[^\s]+/,
        )![0],
      ).searchParams.get("type") === action,
    );
  }
  const messages = prepareMessages({
    user: { email: "old@example.com", new_email: "new@example.com" },
    email_data: {
      ...payload.email_data,
      email_action_type: "email_change",
      token_hash_new: "c".repeat(64),
    },
  }, config.supabaseUrl);
  assert(
    messages[0].to[0].email === "old@example.com" &&
      messages[0].text.includes("c".repeat(64)),
  );
  assert(
    messages[1].to[0].email === "new@example.com" &&
      messages[1].text.includes("b".repeat(64)),
  );
});
