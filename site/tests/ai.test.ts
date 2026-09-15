import { describe, expect, it } from "vitest";
import { managedChatModel } from "../api/ai.js";

describe("managed chat model routing", () => {
  it("routes legacy GPT-5.5 clients to GPT-5.6 Terra", () => {
    expect(managedChatModel("gpt-5.5")).toBe("gpt-5.6-terra");
  });

  it("preserves current models", () => {
    expect(managedChatModel("gpt-5.6-terra")).toBe("gpt-5.6-terra");
    expect(managedChatModel("gpt-5.4-mini")).toBe("gpt-5.4-mini");
  });
});
