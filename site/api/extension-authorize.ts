import { authenticate, sha256 } from "./_lib/auth.js";
import { ApiError, errorResponse, json, options, readJson } from "./_lib/http.js";
import { supabaseAdmin } from "./_lib/supabase.js";

interface PairingRequest {
  nonce?: string;
  deviceId?: string;
}

function validateNonce(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,100}$/.test(value);
}

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  try {
    const user = await authenticate(request);
    if (user.source !== "website") throw new ApiError(403, "website_session_required", "Open the VideoLens account page to connect.");
    const body = await readJson<PairingRequest>(request, 10_000);
    const nonce = body.nonce?.trim() || "";
    const deviceId = body.deviceId?.trim() || "";
    if (!validateNonce(nonce) || deviceId.length < 8 || deviceId.length > 200) {
      throw new ApiError(400, "invalid_pairing", "The extension pairing request is invalid or expired.");
    }

    const { error } = await supabaseAdmin().from("extension_pairings").upsert({
      nonce_hash: sha256(nonce),
      user_id: user.id,
      device_id: deviceId,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      consumed_at: null,
    });
    if (error) throw error;
    return json(request, { authorized: true });
  } catch (error) {
    return errorResponse(request, error);
  }
}

export default { fetch: handler };
