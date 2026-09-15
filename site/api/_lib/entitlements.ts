import { ApiError } from "./http.js";
import { supabaseAdmin } from "./supabase.js";

export interface Entitlement {
  plan: "free" | "pro";
  subscriptionStatus: string;
  managedReportsUsed: number;
  managedReportsLimit: number;
  managedReportsRemaining: number;
  periodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canUseManagedAi: boolean;
  hasBillingSubscription: boolean;
  canUpgrade: boolean;
  billingStartsAt: string | null;
  complimentary: { state: "pending" | "active" | "expired"; activatedAt: string | null; expiresAt: string | null } | null;
}

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const { data, error } = await supabaseAdmin().rpc("get_managed_entitlement", { p_user_id: userId });
  if (error || !data) throw error || new Error("Entitlement unavailable.");
  // Internal quota identifiers are used only by the database reservation function.
  const { quotaPeriodStart: _period, quotaGrantId: _grant, ...entitlement } = data;
  return entitlement as Entitlement;
}

export interface Reservation {
  reportId: string;
  plan: "free" | "pro";
  used: number;
  limit: number;
}

export async function reserveReport(userId: string, deviceId: string, cloudSave: boolean): Promise<Reservation> {
  const { data, error } = await supabaseAdmin().rpc("reserve_managed_report", {
    p_user_id: userId,
    p_device_id: deviceId,
    p_cloud_save: cloudSave,
  });
  if (error) {
    if (error.message.includes("managed_report_retry_limited")) {
      throw new ApiError(429, "managed_report_retry_limited", "Several scans have failed recently. Your allowance is preserved. Please try again in an hour.");
    }
    if (error.message.includes("managed_report_quota_exhausted")) {
      throw new ApiError(402, "managed_report_quota_exhausted", "Your managed-report allowance is used up.");
    }
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Report reservation returned no row.");
  return {
    reportId: row.report_id,
    plan: row.plan,
    used: Number(row.used),
    limit: Number(row.report_limit),
  };
}

export async function recordAiRequest(userId: string, reportId: string, kind: "chat" | "transcription"): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc("begin_managed_ai_request", {
    p_user_id: userId,
    p_report_id: reportId,
    p_kind: kind,
  });
  if (error) {
    if (error.message.includes("managed_ai_request_limit_exhausted")) {
      throw new ApiError(429, "managed_ai_request_limit_exhausted", "This report has reached its managed-AI request limit.");
    }
    if (error.message.includes("invalid_report_reservation")) {
      throw new ApiError(403, "invalid_report_reservation", "This report reservation is not valid.");
    }
    throw error;
  }
  if (!Number.isSafeInteger(Number(data)) || Number(data) <= 0) throw new Error("AI request tracking failed.");
  return Number(data);
}
