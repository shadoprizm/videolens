import { createExtensionToken, sha256 } from "./_lib/auth.js";
import { ApiError, errorResponse, json, options } from "./_lib/http.js";
import { supabaseAdmin } from "./_lib/supabase.js";

interface PairingRow {
  nonce_hash: string;
  user_id: string;
  device_id: string;
  expires_at: string;
  consumed_at: string | null;
}

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
  try {
    const url = new URL(request.url);
    const nonce = url.searchParams.get("nonce")?.trim() || "";
    const deviceId = url.searchParams.get("device_id")?.trim() || "";
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(nonce) || deviceId.length < 8) {
      throw new ApiError(400, "invalid_pairing", "The extension pairing request is invalid.");
    }

    const admin = supabaseAdmin();
    const nonceHash = sha256(nonce);
    const { data, error } = await admin
      .from("extension_pairings")
      .select("nonce_hash,user_id,device_id,expires_at,consumed_at")
      .eq("nonce_hash", nonceHash)
      .maybeSingle<PairingRow>();
    if (error) throw error;
    if (!data) return json(request, { status: "pending" }, 202);
    if (data.device_id !== deviceId || data.consumed_at || new Date(data.expires_at).getTime() <= Date.now()) {
      throw new ApiError(410, "pairing_expired", "This extension connection has expired. Start again from VideoLens.");
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("email")
      .eq("user_id", data.user_id)
      .single<{ email: string }>();
    if (profileError || !profile) throw profileError || new Error("Profile missing.");

    const token = await createExtensionToken(data.user_id, profile.email, deviceId);

    // Consume only after every prerequisite for issuing the token succeeds. The
    // conditional update makes the handoff one-use even if two poll requests race.
    const consumedAt = new Date().toISOString();
    const { data: consumed, error: consumeError } = await admin
      .from("extension_pairings")
      .update({ consumed_at: consumedAt })
      .eq("nonce_hash", nonceHash)
      .is("consumed_at", null)
      .select("user_id")
      .maybeSingle<{ user_id: string }>();
    if (consumeError) throw consumeError;
    if (!consumed) throw new ApiError(409, "pairing_already_used", "This extension connection was already used.");

    return json(request, { status: "connected", token, email: profile.email });
  } catch (error) {
    return errorResponse(request, error);
  }
}

export default { fetch: handler };
