import { describe, expect, it } from "vitest";
import { managedChatModel } from "../api/ai.js";

describe("managed chat model routing", () => {
  it("routes legacy clients to the current report model", () => {
    expect(managedChatModel("gpt-5.5")).toBe("gpt-6-luna");
  });

  it("preserves current models", () => {
    expect(managedChatModel("gpt-5.6-terra")).toBe("gpt-6-luna");
    expect(managedChatModel("gpt-5.4-mini")).toBe("gpt-5.4-mini");
  });
});

it("requires the updated notice before changing processors and routes each quality role", () => {
 expect(managedChatModel("gpt-6-luna", undefined, "general", "frames")).toBe("gpt-6-luna");
 expect(managedChatModel("gpt-6-luna", "managed-providers-2026-10", "general", "frames")).toBe("gpt-6-luna");
 expect(managedChatModel("gpt-6-luna", "managed-providers-2026-10", "general", "report")).toBe("zai/glm-5.3-flash");
 expect(managedChatModel("gpt-6-luna", "managed-providers-2026-10", "tutorial", "report")).toBe("gpt-6-luna");
});
