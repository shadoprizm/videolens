import { MCP_RESOURCE, oauthIssuer } from "./_lib/mcpAuth.js";

export function handler(request: Request): Response {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  return Response.json({
    resource: MCP_RESOURCE,
    authorization_servers: [oauthIssuer()],
    scopes_supported: ["openid", "email"],
    bearer_methods_supported: ["header"],
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}

export default { fetch: handler };
