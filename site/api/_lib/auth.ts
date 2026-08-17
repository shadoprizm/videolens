import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { User } from "@supabase/supabase-js";
import { ApiError } from "./http.js";
import { requireEnv } from "./env.js";
import { ensureUserRecords, supabaseAdmin } from "./supabase.js";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  source: "website" | "extension";
  deviceId: string | null;
}

function bearerToken(request: Request): string {
  const value = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(value);
  if (!match) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  return match[1];
}

function extensionSecret(): Uint8Array {
  const secret = requireEnv("VIDEOLENS_EXTENSION_JWT_SECRET");
  if (secret.length < 32) throw new Error("VIDEOLENS_EXTENSION_JWT_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(secret);
}

export async function authenticate(request: Request): Promise<AuthenticatedUser> {
  const token = bearerToken(request);

  try {
    const { payload } = await jwtVerify(token, extensionSecret(), {
      issuer: "https://videolens.io",
      audience: "videolens-extension",
    });
    if (!payload.sub || typeof payload.device_id !== "string") throw new Error("Invalid extension token.");
    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      source: "extension",
      deviceId: payload.device_id,
    };
  } catch {
    // A website session is a Supabase access token. Validate it against Auth;
    // never trust the user object stored in the browser session by itself.
  }

  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "unauthorized", "Your session has expired. Sign in again.");
  await ensureUserRecords(data.user);
  return fromSupabaseUser(data.user);
}

function fromSupabaseUser(user: User): AuthenticatedUser {
  return { id: user.id, email: user.email || null, source: "website", deviceId: null };
}

export async function createExtensionToken(
  userId: string,
  email: string,
  deviceId: string,
): Promise<string> {
  return new SignJWT({ email, device_id: deviceId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer("https://videolens.io")
    .setAudience("videolens-extension")
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime("30d")
    .sign(extensionSecret());
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
