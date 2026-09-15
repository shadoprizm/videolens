import { supabaseAdmin } from "./supabase.js";

export type AiFailureCode = "model_access_denied" | "rate_limited" | "provider_authentication" | "provider_unavailable" | "invalid_provider_response" | "invalid_ai_input" | "network_error" | "request_timeout" | "configuration_error";
export type ManagedAiProvider =
  | { kind: "openai"; token: string }
  | { kind: "gateway"; token: string; authMethod: "api-key" | "oidc" };

export function failureCode(status: number, body = ""): AiFailureCode {
  // Inspect only to classify; never persist provider bodies, which may echo input.
  if (status === 403 && /free tier users do not have access to this model/i.test(body)) return "model_access_denied";
  if (status === 404 && /model/i.test(body)) return "model_access_denied";
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "provider_authentication";
  if (status === 400 || status === 413 || status === 422) return "invalid_ai_input";
  return "provider_unavailable";
}

export function exceptionCode(error: unknown): AiFailureCode {
  if (error instanceof Error && /timeout|abort/i.test(error.name)) return "request_timeout";
  return "network_error";
}

export function providerException(error: unknown): { status: number | null; code: AiFailureCode } {
  // AI SDK retries wrap the upstream error in lastError. Keep its status while
  // discarding all provider text; otherwise a 429 appears to be a network error.
  let current = error;
  for (let depth = 0; depth < 6 && typeof current === "object" && current !== null; depth++) {
    if ("statusCode" in current && typeof current.statusCode === "number") {
      const body = "responseBody" in current && typeof current.responseBody === "string" ? current.responseBody : current instanceof Error ? current.message : "";
      return { status: current.statusCode, code: failureCode(current.statusCode, body) };
    }
    if (exceptionCode(current) === "request_timeout") return { status: null, code: "request_timeout" };
    if ("lastError" in current) current = current.lastError;
    else if ("cause" in current) current = current.cause;
    else break;
  }
  return { status: null, code: exceptionCode(current) };
}

export interface AiDiagnostic {
  requested_model: string;
  effective_model: string;
  provider: "openai" | "gateway";
  outcome: "succeeded" | "failed";
  http_status: number | null;
  error_code: AiFailureCode | null;
  fallback_used: boolean;
  duration_ms: number;
}

export async function finishAiRequest(id: number, diagnostic: AiDiagnostic): Promise<void> {
  // Observability must not turn a successful report into a failure.
  try {
    const { error } = await supabaseAdmin().from("ai_requests").update(diagnostic).eq("id", id);
    if (error) console.error("Managed AI diagnostic write failed", { requestId: id });
  } catch {
    console.error("Managed AI diagnostic write failed", { requestId: id });
  }
}

export interface ChatResult {
  body: string;
  status: number;
  model: string;
  fallbackUsed: boolean;
  errorCode: AiFailureCode | null;
}

export function retryDelayMs(response: Response): number {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
    if (Number.isFinite(delay)) return Math.max(1000, Math.min(30_000, delay));
  }
  return 2000;
}

export async function requestManagedChat(provider: ManagedAiProvider, payload: Record<string, unknown>, initialModel: string): Promise<ChatResult> {
  let model = initialModel;
  let fallbackUsed = false;
  let transientRetryUsed = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    let body: string;
    try {
      response = await fetch(provider.kind === "gateway"
        ? "https://ai-gateway.vercel.sh/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.token}`,
          "Content-Type": "application/json",
          ...(provider.kind === "gateway" ? { "ai-gateway-auth-method": provider.authMethod, "ai-gateway-protocol-version": "0.0.1" } : {}),
        },
        body: JSON.stringify({ ...payload, model: provider.kind === "gateway" ? `openai/${model}` : model }),
        signal: AbortSignal.timeout(90_000),
      });
      body = await response.text();
    } catch (error) {
      return { body: "", status: 502, model, fallbackUsed, errorCode: exceptionCode(error) };
    }
    if (response.ok) {
      let content: unknown;
      try { content = JSON.parse(body)?.choices?.[0]?.message?.content; } catch { /* classified below */ }
      let valid = typeof content === "string" && content.trim().length > 0;
      if (valid && payload.response_format) {
        try {
          const parsed: unknown = JSON.parse(content as string);
          valid = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
        } catch { valid = false; }
      }
      if (!valid) return { body: "", status: 502, model, fallbackUsed, errorCode: "invalid_provider_response" };
      return { body, status: response.status, model, fallbackUsed, errorCode: null };
    }
    const code = failureCode(response.status, body);
    if ((code === "model_access_denied" || code === "rate_limited") && model !== "gpt-5.4-mini" && !fallbackUsed) {
      // Same provider/data destination; preserve the user's input and JSON schema.
      model = "gpt-5.4-mini";
      fallbackUsed = true;
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && !transientRetryUsed && attempt < 2) {
      transientRetryUsed = true;
      await new Promise(resolve => setTimeout(resolve, retryDelayMs(response)));
      continue;
    }
    return { body: "", status: response.status, model, fallbackUsed, errorCode: code };
  }
  return { body: "", status: 502, model, fallbackUsed, errorCode: "provider_unavailable" };
}
