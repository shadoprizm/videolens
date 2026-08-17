import { ApiError } from "./http.js";
import { planConfig } from "./env.js";
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
}

interface SubscriptionRow {
  plan: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const admin = supabaseAdmin();
  const { data: subscription, error } = await admin
    .from("subscriptions")
    .select("plan,status,current_period_start,current_period_end,cancel_at_period_end")
    .eq("user_id", userId)
    .single<SubscriptionRow>();
  if (error || !subscription) throw error || new Error("Subscription row missing.");

  const isPro = subscription.plan === "pro" && ["active", "trialing"].includes(subscription.status);
  const plan = isPro ? "pro" : "free";
  const limit = isPro ? planConfig.proManagedReports : planConfig.freeManagedReports;
  const now = new Date();
  const periodStart = isPro
    ? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
    : "1970-01-01";
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const { count, error: countError } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("quota_period_start", periodStart);
  if (countError) throw countError;
  const used = count || 0;

  return {
    plan,
    subscriptionStatus: subscription.status,
    managedReportsUsed: used,
    managedReportsLimit: limit,
    managedReportsRemaining: Math.max(0, limit - used),
    periodEndsAt: isPro ? nextMonth.toISOString() : null,
    cancelAtPeriodEnd: isPro && subscription.cancel_at_period_end,
    canUseManagedAi: used < limit,
  };
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

export async function recordAiRequest(userId: string, reportId: string, kind: "chat" | "transcription"): Promise<void> {
  const { error } = await supabaseAdmin().rpc("record_managed_ai_request", {
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
}
