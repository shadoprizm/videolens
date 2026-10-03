import { videoLensMcp } from "./_lib/chatgptMcp.js";
import { authorizationChallenge, verifyMcpToken } from "./_lib/mcpAuth.js";

export async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }
  const identity = await verifyMcpToken(request.headers.get("authorization"));
  if (!identity) return authorizationChallenge();
  try {
    return await videoLensMcp(identity).fetch(request);
  } catch (error) {
    console.error("VideoLens MCP request failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}

export default { fetch: handler };
