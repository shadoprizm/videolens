import { createHash } from "node:crypto";
import { supabaseAdmin } from "./supabase.js";

// Deliberately no arbitrary metadata parameter or public ingestion endpoint.
export async function recordActivation(userId: string, event: "account_connected" | "checkout_started" | "subscription_active", opaqueId: string): Promise<void> {
  try {
    const eventKey = createHash("sha256").update(opaqueId).digest("hex");
    const { error } = await supabaseAdmin().from("activation_events").insert({ user_id: userId, event, event_key: eventKey }).abortSignal(AbortSignal.timeout(1500));
    if (error && error.code !== "23505") console.warn("Activation milestone unavailable");
  } catch { console.warn("Activation milestone unavailable"); }
}
