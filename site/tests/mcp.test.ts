import { expect, it, vi } from "vitest";
import { getSavedReport, listSavedReports, searchSavedReports } from "../api/_lib/mcpReports.js";

vi.mock("../api/_lib/supabase.js", () => ({ supabaseAdmin: () => ({ from: () => { throw new Error("No database access expected"); } }) }));

const report = { id: "11111111-1111-4111-8111-111111111111", title: "Saved tutorial", mode: "procedure", source_type: "youtube", created_at: "2026-10-03T00:00:00Z", report_data: { summary: "A useful summary" } };
function fakeDb() {
  const filters: [string, unknown][] = [];
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    order: () => query,
    range: async () => ({ data: [report], error: null }),
    limit: async () => ({ data: [report], error: null }),
    maybeSingle: async () => ({ data: report, error: null }),
  };
  return { db: { from: (table: string) => { expect(table).toBe("reports"); return query; } } as never, filters };
}

it("binds every report lookup to the user and cloud-saved completed status", async () => {
  for (const operation of [
    (db: never) => listSavedReports(db, "user-1", 0),
    (db: never) => searchSavedReports(db, "user-1", "useful"),
    (db: never) => getSavedReport(db, "user-1", report.id),
  ]) {
    const { db, filters } = fakeDb();
    await operation(db);
    expect(filters).toContainEqual(["user_id", "user-1"]);
    expect(filters).toContainEqual(["cloud_saved", true]);
    expect(filters).toContainEqual(["status", "complete"]);
  }
});

it("serves MCP initialization, read-only tool listings, and account profile", async () => {
  const { videoLensMcp } = await import("../api/_lib/chatgptMcp.js");
  const handler = videoLensMcp({ userId: "user-1", email: "user@example.invalid", clientId: "chatgpt", scopes: ["openid", "email"], expiresAt: 9999999999 });
  const call = async (method: string, params: Record<string, unknown>, id: number) => {
    const response = await handler.fetch(new Request("https://videolens.io/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }));
    expect(response.status).toBe(200);
    const body = await response.text();
    return response.headers.get("content-type")?.includes("text/event-stream")
      ? JSON.parse(body.split("\n").find(line => line.startsWith("data: "))!.slice(6))
      : JSON.parse(body);
  };
  const hello = await call("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } }, 1) as any;
  expect(hello.result.serverInfo.name).toBe("videolens");
  const listing = await call("tools/list", {}, 2) as any;
  expect(listing.result.tools.map((tool: any) => tool.name)).toEqual(["get_profile", "list_saved_reports", "search_saved_reports", "get_saved_report", "get_report_timeline"]);
  for (const tool of listing.result.tools) {
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: [] }]);
    expect(tool._meta.securitySchemes).toEqual([{ type: "oauth2", scopes: [] }]);
  }
  const profile = await call("tools/call", { name: "get_profile", arguments: {} }, 3) as any;
  expect(profile.result.structuredContent).toEqual({ id: "user-1", email: "user@example.invalid" });
});
