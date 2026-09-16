import { afterEach, describe, expect, it, vi } from "vitest";
import { providerException, requestManagedChat, retryDelayMs } from "../api/_lib/managed-ai.js";
const provider = { kind: "gateway", token: "test-token", authMethod: "oidc" } as const;
const payload = { messages: [{ role: "user", content: "Return JSON" }], response_format: { type: "json_object" }, max_completion_tokens: 12000 };
const denied = () => Response.json({ error: { message: "Free tier users do not have access to this model.", type: "no_providers_available" } }, { status: 403 });
const success = () => Response.json({ choices: [{ message: { content: '{"summary":"A useful report"}' } }] });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("managed AI recovery", () => {
  it("retains upstream status from SDK retry wrappers without returning provider text", () => {
    expect(providerException({ lastError: { cause: { statusCode: 429, responseBody: "sensitive upstream text" } } })).toEqual({ status: 429, code: "rate_limited" });
    expect(providerException({ lastError: { statusCode: 403, responseBody: "Free tier users do not have access to this model." } })).toEqual({ status: 403, code: "model_access_denied" });
    expect(providerException({ cause: new DOMException("secret", "TimeoutError") })).toEqual({ status: null, code: "request_timeout" });
    const circular: { cause?: unknown } = {}; circular.cause = circular;
    expect(providerException(circular)).toEqual({ status: null, code: "network_error" });
  });
  it("recovers the production gateway access denial without changing the prompt or JSON format", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(denied()).mockResolvedValueOnce(success()); vi.stubGlobal("fetch", fetcher);
    const result = await requestManagedChat(provider, payload, "gpt-5.6-terra");
    expect(result).toMatchObject({ status: 200, model: "gpt-5.4-mini", fallbackUsed: true, errorCode: null });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ ...payload, model: "openai/gpt-5.6-terra" });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ ...payload, model: "openai/gpt-5.4-mini" });
    expect(fetcher.mock.calls[1][0]).toBe("https://ai-gateway.vercel.sh/v1/chat/completions");
  });
  it("uses the available model if the primary model is rate limited", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("rate limited", { status: 429 })).mockResolvedValueOnce(success()); vi.stubGlobal("fetch", fetcher);
    expect(await requestManagedChat(provider, payload, "gpt-5.6-terra")).toMatchObject({ status: 200, model: "gpt-5.4-mini", fallbackUsed: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("honors Retry-After within the function's bounded waiting budget", () => {
    expect(retryDelayMs(new Response("", { headers: { "retry-after": "12" } }))).toBe(12000);
    expect(retryDelayMs(new Response("", { headers: { "retry-after": "999" } }))).toBe(30000);
    expect(retryDelayMs(new Response(""))).toBe(2000);
  });
  it("does not retry invalid credentials, unsafe input, or an inaccessible fallback model", async () => {
    for (const status of [401, 400, 403]) {
      const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { message: "rejected" } }, { status })); vi.stubGlobal("fetch", fetcher);
      const result = await requestManagedChat(provider, payload, "gpt-5.6-terra");
      expect(result.errorCode).not.toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const fetcher = vi.fn().mockResolvedValue(denied()); vi.stubGlobal("fetch", fetcher);
    const result = await requestManagedChat(provider, payload, "gpt-5.4-mini");
    expect(result.errorCode).toBe("model_access_denied"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("bounds transient retries and strips provider error bodies", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ error: { message: "secret user input" } }, { status: 503 })); vi.stubGlobal("fetch", fetcher);
    const pending = requestManagedChat(provider, payload, "gpt-5.4-mini"); await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ status: 503, errorCode: "provider_unavailable", body: "" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("can recover a transient failure after switching models, with at most three attempts", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(denied()).mockResolvedValueOnce(new Response("busy", { status: 429 })).mockResolvedValueOnce(success()); vi.stubGlobal("fetch", fetcher);
    const pending = requestManagedChat(provider, payload, "gpt-5.6-terra"); await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ status: 200, fallbackUsed: true }); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each(["", "not json", "[]", "null"])("rejects malformed synthesis content: %s", async content => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content } }] })));
    expect(await requestManagedChat(provider, payload, "gpt-5.4-mini")).toMatchObject({ status: 502, errorCode: "invalid_provider_response" });
  });
  it("classifies transport timeouts without leaking exception text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("sensitive url", "TimeoutError")));
    expect(await requestManagedChat(provider, payload, "gpt-5.4-mini")).toMatchObject({ status: 502, errorCode: "request_timeout", body: "" });
  });
});
