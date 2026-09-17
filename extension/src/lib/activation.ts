import type { ProEntitlement } from "./pro";

// Only these coarse categories may leave the device for managed failure diagnostics.
export type FailureCode = "permission" | "source" | "network" | "authentication" | "rate_limit" | "analysis";
export function failureCode(error: unknown): FailureCode {
  const message = error instanceof Error ? error.message : "";
  if (/permission|allow access|denied|activeTab/i.test(message)) return "permission";
  if (/no video|video not|choose.*video|DRM|supports YouTube|too few cooking|nothing.*extract/i.test(message)) return "source";
  if (/401|api key|sign in|expired|connect.*account/i.test(message)) return "authentication";
  if (/429|rate.limit|too many/i.test(message)) return "rate_limit";
  if (/network|fetch|timed? out|did not respond|offline/i.test(message)) return "network";
  return "analysis";
}
export function recoveryHint(code: FailureCode): string {
  return {
    permission: "Allow access to the video page, then try again.",
    source: "Open a playable video and keep its tab open, or choose a local video file.",
    authentication: "Reconnect your account or check your own API key in Settings.",
    rate_limit: "Wait a few minutes before retrying. Keep the same video selected.",
    network: "Check your connection and retry. Your report settings are still here.",
    analysis: "Try again with the same settings. If it repeats, try a shorter clip.",
  }[code];
}
export function needsManagedContinuation(entitlement: ProEntitlement | null, managedReportId: string | null): boolean {
  return Boolean(managedReportId && entitlement?.plan === "free" && entitlement.managedReportsRemaining === 0);
}
