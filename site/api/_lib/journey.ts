import { createHash } from "node:crypto";
import { JOURNEY_EVENTS, type JourneyEvent } from "../../shared/journey.js";
import { supabaseAdmin } from "./supabase.js";

export { JOURNEY_EVENTS };
export async function recordJourney(userId: string, event: JourneyEvent, surface: "website" | "extension", reportId?: string): Promise<void> {
  // At most one of each event per member, report and UTC day. Re-renders and
  // retries cannot inflate conversion counts; billing has its own durable ledger.
  const key = createHash("sha256").update(`${userId}:${event}:${surface}:${reportId || ""}:${new Date().toISOString().slice(0,10)}`).digest("hex");
  try {
    const { error } = await supabaseAdmin().from("journey_events").insert({ user_id: userId, event, surface, report_id: reportId || null, event_key: key }).abortSignal(AbortSignal.timeout(1500));
    if (error && error.code !== "23505") console.warn("Journey milestone unavailable");
  } catch { console.warn("Journey milestone unavailable"); }
}
