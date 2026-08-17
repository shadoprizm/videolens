import { authenticate } from "./_lib/auth.js";
import { getEntitlement } from "./_lib/entitlements.js";
import { errorResponse, json, options } from "./_lib/http.js";

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
  try {
    const user = await authenticate(request);
    return json(request, {
      user: { id: user.id, email: user.email },
      entitlement: await getEntitlement(user.id),
    });
  } catch (error) {
    return errorResponse(request, error);
  }
}

export default { fetch: handler };
