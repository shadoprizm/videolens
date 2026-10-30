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

it("uses the customer-validated Luna reviewer for both general routing policies", () => {
 expect(managedChatModel("gpt-6-luna", undefined, "general", "frames")).toBe("gpt-6-luna");
 expect(managedChatModel("gpt-6-luna", "managed-providers-2026-10", "general", "frames")).toBe("gpt-6-luna");
 expect(managedChatModel("gpt-6-luna", "managed-providers-2026-10", "general", "report")).toBe("gpt-6-luna");
 expect(managedChatModel("gpt-6-luna", "managed-providers-2026-10", "general", "followup")).toBe("gpt-6-luna");
 expect(managedChatModel("gpt-6-luna", "managed-providers-2026-10", "tutorial", "report")).toBe("gpt-6-luna");
});

it('preserves all client evidence and applies review safeguards only to final general review', async () => {
 const { reviewedMessages, GENERAL_REVIEW_POLICY } = await import('../api/ai.js');
 const messages = [{role:'system',content:'Return the report schema.'},{role:'user',content:[{type:'text',text:'Frame at 10.5 seconds'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,image'}}]}];
 const reviewed = reviewedMessages(messages,true);
 expect(reviewed.slice(0,messages.length)).toEqual(messages);
 expect(reviewed.at(-1)).toEqual({role:'system',content:GENERAL_REVIEW_POLICY});
 expect(reviewedMessages(messages,false)).toBe(messages);
 expect(GENERAL_REVIEW_POLICY).toContain('not necessarily the current road');
});
