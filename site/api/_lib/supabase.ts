import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { requireEnv } from "./env.js";

let adminClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return adminClient;
}

export async function ensureUserRecords(user: User): Promise<void> {
  const admin = supabaseAdmin();
  const email = user.email?.trim().toLowerCase();
  if (!email) throw new Error("Authenticated user has no email address.");

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      user_id: user.id,
      email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (profileError) throw profileError;

  const { error: subscriptionError } = await admin.from("subscriptions").upsert(
    { user_id: user.id },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (subscriptionError) throw subscriptionError;
}
