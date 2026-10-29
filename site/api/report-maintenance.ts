import { timingSafeEqual } from "node:crypto";
import { releaseStaleReports } from "./_lib/entitlements.js";
import { optionalEnv } from "./_lib/env.js";
import { json } from "./_lib/http.js";

export async function handler(request: Request): Promise<Response> {
  const secret = optionalEnv("CRON_SECRET");
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(request, { error: "unauthorized" }, 401);
  if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
  return json(request, { released: await releaseStaleReports() });
}
export default { fetch: handler };
