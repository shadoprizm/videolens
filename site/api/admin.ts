import { requireAdministrator } from "./_lib/admin.js";
import { ApiError, errorResponse, json, options } from "./_lib/http.js";
import { supabaseAdmin } from "./_lib/supabase.js";

function page(value: string | null): number {
  if (value === null) return 1;
  if (!/^[1-9]\d{0,5}$/.test(value) || Number(value) > 100000) {
    throw new ApiError(400, "invalid_page", "Choose a valid page.");
  }
  return Number(value);
}

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
  try {
    await requireAdministrator(request);
    const params = new URL(request.url).searchParams;
    const membership = params.get("membership") || "all";
    if (!["all", "paid", "free", "trial", "complimentary"].includes(membership)) {
      throw new ApiError(400, "invalid_membership", "Choose a valid membership filter.");
    }
    const userId = params.get("userId") || null;
    if (userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new ApiError(400, "invalid_user", "Choose a valid member.");
    }
    const { data, error } = await supabaseAdmin().rpc("administrator_dashboard", {
      p_query: (params.get("q") || "").trim().slice(0, 200),
      p_membership: membership,
      p_page: page(params.get("page")),
      p_activity_page: page(params.get("activityPage")),
      p_user_id: userId,
    });
    if (error) throw error;
    return json(request, data);
  } catch (error) {
    return errorResponse(request, error);
  }
}
export default { fetch: handler };
