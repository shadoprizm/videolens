import { authenticate } from "./_lib/auth.js";
import { ApiError, errorResponse, json, options, readJson } from "./_lib/http.js";
import { JOURNEY_EVENTS, recordJourney } from "./_lib/journey.js";
import type { JourneyEvent } from "../../shared/journey.js";
import { supabaseAdmin } from "./_lib/supabase.js";

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  try {
    const user = await authenticate(request);
    const body = await readJson<{ event?: JourneyEvent; reportId?: string }>(request, 1000);
    if (!body.event || !JOURNEY_EVENTS.includes(body.event) || Object.keys(body).some(key => !["event", "reportId"].includes(key))) throw new ApiError(400, "invalid_event", "Choose a supported action.");
    // Extension reports remain private. Only explicit feedback is submitted;
    // reading/exporting BYOK reports never contacts this endpoint.
    if (user.source === "extension" && !body.event.startsWith("feedback_")) throw new ApiError(403, "unsupported_event", "Only report feedback is supported here.");
    if (body.reportId) {
      if (!/^[0-9a-f-]{36}$/i.test(body.reportId)) throw new ApiError(400, "invalid_report", "Choose a valid report.");
      const { data, error } = await supabaseAdmin().from("reports").select("id").eq("id", body.reportId).eq("user_id", user.id).eq("status", "complete").maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError(404, "report_not_found", "Report not found.");
    } else if (body.event.startsWith("feedback_") || body.event.startsWith("report_")) throw new ApiError(400, "report_required", "Choose a report.");
    await recordJourney(user.id, body.event, user.source, body.reportId);
    return json(request, { recorded: true });
  } catch (error) { return errorResponse(request, error); }
}
export default { fetch: handler };
