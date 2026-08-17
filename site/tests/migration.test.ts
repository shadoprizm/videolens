import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../supabase/migrations/20260817230407_pro_accounts_billing_and_reports.sql", import.meta.url),
);
const migration = readFileSync(migrationPath, "utf8");

describe("Pro database security migration", () => {
  it("enables RLS on every exposed table", () => {
    for (const table of ["profiles", "subscriptions", "reports", "ai_requests", "extension_pairings", "stripe_events"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("locks privileged quota functions to the service role", () => {
    expect(migration).toContain("revoke all on function public.reserve_managed_report");
    expect(migration).toContain("grant execute on function public.reserve_managed_report(uuid, text, boolean) to service_role");
    expect(migration).toContain("set search_path = ''");
  });
});
