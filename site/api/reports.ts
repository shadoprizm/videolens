import { authenticate } from "./_lib/auth.js";
import { getEntitlement, reserveReport } from "./_lib/entitlements.js";
import { ApiError, errorResponse, json, options, readJson } from "./_lib/http.js";
import { supabaseAdmin } from "./_lib/supabase.js";

interface ReportRequest {
  action?: "reserve" | "complete";
  reportId?: string;
  deviceId?: string;
  cloudSave?: boolean;
  status?: "complete" | "failed";
  title?: string;
  sourceType?: string;
  mode?: string;
  reportData?: unknown;
}

function safeText(value: unknown, fallback: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, max);
}

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request);
  if (preflight) return preflight;
  try {
    const user = await authenticate(request);
    const admin = supabaseAdmin();

    if (request.method === "GET") {
      const { data, error } = await admin
        .from("reports")
        .select("id,title,source_type,mode,report_data,created_at,updated_at,completed_at")
        .eq("user_id", user.id)
        .eq("cloud_saved", true)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return json(request, { reports: data || [] });
    }

    if (request.method === "DELETE") {
      const reportId = new URL(request.url).searchParams.get("id") || "";
      if (!reportId) throw new ApiError(400, "report_id_required", "Choose a report to delete.");
      const { error } = await admin.from("reports").delete().eq("id", reportId).eq("user_id", user.id);
      if (error) throw error;
      return json(request, { deleted: true });
    }

    if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
    const body = await readJson<ReportRequest>(request);

    if (body.action === "reserve") {
      const deviceId = user.deviceId || body.deviceId?.trim() || "";
      if (deviceId.length < 8) throw new ApiError(400, "device_id_required", "A valid extension device ID is required.");
      const reservation = await reserveReport(user.id, deviceId, Boolean(body.cloudSave));
      return json(request, { reservation, entitlement: await getEntitlement(user.id) }, 201);
    }

    if (body.action === "complete") {
      if (!body.reportId || (body.status !== "complete" && body.status !== "failed")) {
        throw new ApiError(400, "invalid_report_completion", "Report completion data is invalid.");
      }
      const cloudSave = body.status === "complete" && Boolean(body.cloudSave);
      if (cloudSave && body.reportData === undefined) {
        throw new ApiError(400, "report_data_required", "Cloud saving requires report data.");
      }
      const update = {
        status: body.status,
        title: safeText(body.title, "Untitled video", 300),
        source_type: safeText(body.sourceType, "video", 80),
        mode: safeText(body.mode, "general", 80),
        cloud_saved: cloudSave,
        report_data: cloudSave ? body.reportData : null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await admin
        .from("reports")
        .update(update)
        .eq("id", body.reportId)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle<{ id: string }>();
      if (error) throw error;
      if (!data) throw new ApiError(409, "report_already_completed", "This report was already completed.");
      return json(request, { reportId: data.id, saved: cloudSave, entitlement: await getEntitlement(user.id) });
    }

    throw new ApiError(400, "invalid_action", "Choose a valid report action.");
  } catch (error) {
    return errorResponse(request, error);
  }
}

export default { fetch: handler };
