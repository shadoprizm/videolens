const challenge = "qsdN_0t45DI4JNkdIdWbmrY1srIzdSy2Bm_qdnPeEN8";

export function handler(request: Request): Response {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  return new Response(challenge, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export default { fetch: handler };
