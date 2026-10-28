import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../supabase/migrations/20260818010844_pro_accounts_billing_and_reports.sql", import.meta.url),
);
const migration = readFileSync(migrationPath, "utf8");

describe("report pack ledger migration", () => {
  const packs = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261026120000_founding_members_and_credit_packs.sql", import.meta.url)), "utf8");
  it("keeps purchased credits server-only and idempotent per Checkout session", () => {
    expect(packs).toContain("alter table public.report_credit_grants enable row level security");
    expect(packs).toContain("revoke all on public.report_credit_grants from public, anon, authenticated");
    expect(packs).toContain("stripe_session_id text not null unique");
    expect(packs).toContain("revoke all on function public.get_managed_entitlement(uuid) from public, anon, authenticated");
    expect(packs).toContain("v_limit := 3 + v_purchased");
  });
});

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

  it("explicitly exposes only the required database privileges", () => {
    expect(migration).toContain("grant select, insert, update, delete on table public.profiles to service_role");
    expect(migration).toContain("grant usage, select on sequence public.ai_requests_id_seq to service_role");
    expect(migration).toContain("grant select, delete on table public.reports to authenticated");
  });
});

describe("first-report nudge migration", () => {
  const nudge = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261028120000_first_report_nudge.sql", import.meta.url)), "utf8");
  it("keeps the candidate query service-only and able to read auth.users", () => {
    expect(nudge).toContain("language plpgsql volatile security definer set search_path = ''");
    expect(nudge).toContain("#variable_conflict use_column");
    expect(nudge).toContain("revoke all on function public.marketing_candidates(text, timestamptz, integer) from public, anon, authenticated");
    expect(nudge).toContain("grant execute on function public.marketing_candidates(text, timestamptz, integer) to service_role");
  });
  it("targets 48-hour-old members who never reserved a report, and still honours opt-outs", () => {
    expect(nudge).toContain("p.opted_out_at is null");
    expect(nudge).toContain("when 'first_report_nudge' then u.created_at <= now() - interval '48 hours'");
    expect(nudge).toContain("r.quota_period_start is not null");
    expect(nudge).toMatch(/campaign in \([^)]*'first_report_nudge'\)/);
    expect(nudge).toMatch(/event in \([^)]*'web_app_clicked'/);
  });
});
