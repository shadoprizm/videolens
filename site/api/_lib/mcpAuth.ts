import { createRemoteJWKSet, jwtVerify } from "jose";
import { supabaseAdmin } from "./supabase.js";

export const MCP_RESOURCE = "https://videolens.io/api/mcp";
export const MCP_RESOURCE_METADATA = "https://videolens.io/.well-known/oauth-protected-resource";

export interface McpIdentity {
  userId: string;
  email: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

const issuer = () => `${(process.env.SUPABASE_URL || "https://pjetrkwsypvyndqbxoth.supabase.co").replace(/\/$/, "")}/auth/v1`;
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export function oauthIssuer(): string {
  return issuer();
}

export async function verifyMcpToken(value: string | null): Promise<McpIdentity | null> {
  const token = /^Bearer\s+(.+)$/i.exec(value || "")?.[1];
  if (!token) return null;
  try {
    jwks ||= createRemoteJWKSet(new URL(`${oauthIssuer()}/.well-known/jwks.json`));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: oauthIssuer(),
      audience: MCP_RESOURCE,
      algorithms: ["ES256", "RS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.client_id !== "string"
      || typeof payload.exp !== "number") return null;
    // This rechecks the actual user and prevents a valid but orphaned token
    // from granting access to another account's reports.
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data.user || data.user.id !== payload.sub || !data.user.email) return null;
    return {
      userId: data.user.id,
      email: data.user.email,
      clientId: payload.client_id,
      scopes: typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

export function authorizationChallenge(): Response {
  return Response.json({ error: "unauthorized", message: "Connect your VideoLens account." }, {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Bearer resource_metadata="${MCP_RESOURCE_METADATA}", error="invalid_token", error_description="Connect your VideoLens account"`,
    },
  });
}
