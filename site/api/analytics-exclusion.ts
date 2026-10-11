import { requireAdministrator } from "./_lib/admin.js";
import { ApiError, errorResponse, json, options, readJson } from "./_lib/http.js";
import { supabaseAdmin } from "./_lib/supabase.js";
export async function handler(request: Request): Promise<Response> {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" },405);
  try {
    await requireAdministrator(request);
    const body = await readJson<{userId?: string; excluded?: boolean}>(request,1000);
    if (!body.userId || !/^[0-9a-f-]{36}$/i.test(body.userId) || typeof body.excluded !== "boolean") throw new ApiError(400,"invalid_exclusion","Choose a valid member.");
    const table = supabaseAdmin().from("analytics_exclusions");
    const { error } = body.excluded ? await table.upsert({user_id:body.userId},{onConflict:"user_id"}) : await table.delete().eq("user_id",body.userId);
    if (error) throw error;
    return json(request,{excluded:body.excluded});
  } catch(error) { return errorResponse(request,error); }
}
export default { fetch:handler };
