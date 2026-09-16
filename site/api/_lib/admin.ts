import type { User } from "@supabase/supabase-js";
import { ApiError } from "./http.js";
import { supabaseAdmin } from "./supabase.js";

export function isAdministrator(user: Pick<User, "email" | "email_confirmed_at">): boolean {
  return Boolean(user.email_confirmed_at) && user.email?.trim().toLowerCase() === "ratelle.ja@gmail.com";
}

export async function requireAdministrator(request: Request): Promise<User> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) throw new ApiError(401, "unauthorized", "Sign in to your administrator account.");
  // Validate with Auth on every request: extension tokens and client metadata
  // cannot authorize access to membership data.
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "unauthorized", "Your session has expired. Sign in again.");
  if (!isAdministrator(data.user)) throw new ApiError(403, "admin_required", "This account does not have administrator access.");
  return data.user;
}
