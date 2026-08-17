import { describe, expect, it } from "vitest";
import { corsHeaders, readJson } from "../api/_lib/http.js";

describe("API HTTP boundaries", () => {
  it("allows only the production extension and owned website origins", () => {
    const extension = new Request("https://videolens.io/api/entitlement", {
      headers: { Origin: "chrome-extension://plhohhmnkfidolnjnmdaenhdjkbbledl" },
    });
    const attacker = new Request("https://videolens.io/api/entitlement", {
      headers: { Origin: "https://attacker.example" },
    });

    expect(new Headers(corsHeaders(extension)).get("Access-Control-Allow-Origin"))
      .toBe("chrome-extension://plhohhmnkfidolnjnmdaenhdjkbbledl");
    expect(new Headers(corsHeaders(attacker)).has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("rejects JSON bodies above the explicit application limit", async () => {
    const request = new Request("https://videolens.io/api/reports", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(64) }),
    });
    await expect(readJson(request, 16)).rejects.toMatchObject({
      status: 413,
      code: "request_too_large",
    });
  });
});
