import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transcribe: vi.fn() }));
vi.mock("ai", () => ({ transcribe: mocks.transcribe }));
vi.mock("@ai-sdk/gateway", () => ({ createGateway: () => ({ transcription: (id: string) => id }) }));
import { managedTranscriptionModel, requestManagedTranscription } from "../api/_lib/transcription.js";
const provider = { kind: "gateway", token: "fixture", authMethod: "oidc" } as const;
beforeEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
it("migrates published legacy clients to current file transcription", () => {
  expect(managedTranscriptionModel("gpt-4o-mini-transcribe")).toBe("gpt-transcribe");
});
it("recovers one transport failure without changing or exposing audio", async () => {
  vi.useFakeTimers();
  mocks.transcribe.mockRejectedValueOnce(new TypeError("private provider text"))
    .mockResolvedValueOnce({ text: "The actual words", language: "en" });
  const pending = requestManagedTranscription(provider, new File(["audio"], "chunk.wav"), "gpt-transcribe");
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ result: { text: "The actual words" }, errorCode: null });
  expect(mocks.transcribe).toHaveBeenCalledTimes(2);
  expect(mocks.transcribe.mock.calls[0][0].model).toBe("openai/gpt-transcribe");
  vi.useRealTimers();
});
it("does not retry authentication failures", async () => {
  mocks.transcribe.mockRejectedValue({ statusCode: 401, responseBody: "private" });
  const result = await requestManagedTranscription(provider, new File(["audio"], "chunk.wav"), "gpt-transcribe");
  expect(result).toEqual({ result: null, status: 401, errorCode: "provider_authentication" });
  expect(mocks.transcribe).toHaveBeenCalledTimes(1);
});
it("does not mark a malformed transcription response as successful", async () => {
  mocks.transcribe.mockResolvedValue({ text: undefined });
  expect(await requestManagedTranscription(provider, new File(["audio"], "chunk.wav"), "gpt-transcribe"))
    .toMatchObject({ result: null, errorCode: "invalid_provider_response" });
});
