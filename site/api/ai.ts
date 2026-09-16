import { createGateway } from "@ai-sdk/gateway";
import { getVercelOidcToken } from "@vercel/oidc";
import { transcribe } from "ai";
import { authenticate } from "./_lib/auth.js";
import { recordAiRequest } from "./_lib/entitlements.js";
import { optionalEnv } from "./_lib/env.js";
import { providerException, failureCode, finishAiRequest, requestManagedChat, type ManagedAiProvider } from "./_lib/managed-ai.js";
import { ApiError, corsHeaders, errorResponse, json, options } from "./_lib/http.js";
import { parseRecipeResearch, recipeResearchPayload } from "../shared/recipeResearch.js";

// Accept GPT-5.5 temporarily for published extension versions, but route those
// legacy requests to Terra so the managed service no longer spends on GPT-5.5.
const CHAT_MODELS = new Set(["gpt-5.4-mini", "gpt-5.5", "gpt-5.6-terra"]);
const TRANSCRIPTION_MODELS = new Set(["gpt-4o-mini-transcribe"]);

export function managedChatModel(requestedModel: string): string {
  return requestedModel === "gpt-5.5" ? "gpt-5.6-terra" : requestedModel;
}

interface ManagedChatRequest {
  kind?: "chat" | "recipe_research";
  input?: string;
  reportId?: string;
  model?: string;
  messages?: unknown[];
  jsonObject?: boolean;
  temperature?: number;
  reasoning_effort?: string;
}

async function managedAiProvider(): Promise<ManagedAiProvider> {
  const openAiKey = optionalEnv("OPENAI_API_KEY");
  if (openAiKey) return { kind: "openai", token: openAiKey };

  const gatewayKey = optionalEnv("AI_GATEWAY_API_KEY");
  if (gatewayKey) return { kind: "gateway", token: gatewayKey, authMethod: "api-key" };

  if (optionalEnv("VERCEL_OIDC_TOKEN") || optionalEnv("VERCEL")) {
    return { kind: "gateway", token: await getVercelOidcToken(), authMethod: "oidc" };
  }

  throw new Error("Managed AI is not configured.");
}

async function proxyChat(request: Request, userId: string): Promise<Response> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 4_000_000) {
    throw new ApiError(413, "request_too_large", "The AI request is too large.");
  }
  let body: ManagedChatRequest;
  try {
    body = JSON.parse(raw) as ManagedChatRequest;
  } catch {
    throw new ApiError(400, "invalid_json", "The request body must be valid JSON.");
  }
  if (body.kind === "recipe_research") return proxyRecipeResearch(request, userId, body);
  if (!body.reportId || !body.model || !CHAT_MODELS.has(body.model) || !Array.isArray(body.messages)) {
    throw new ApiError(400, "invalid_ai_request", "The managed AI request is invalid.");
  }
  if (body.reasoning_effort !== undefined && !["none", "low", "medium", "high", "xhigh", "max"].includes(body.reasoning_effort)) {
    throw new ApiError(400, "invalid_reasoning_effort", "The reasoning effort is invalid.");
  }
  const requestId = await recordAiRequest(userId, body.reportId, "chat");
  const started = Date.now();
  let provider: ManagedAiProvider;
  try { provider = await managedAiProvider(); } catch {
    await finishAiRequest(requestId, { requested_model: body.model, effective_model: body.model, provider: "gateway", outcome: "failed", http_status: null, error_code: "configuration_error", fallback_used: false, duration_ms: Date.now() - started });
    return managedFailure(request, "configuration_error");
  }
  const model = managedChatModel(body.model);

  const openAiBody: Record<string, unknown> = {
    messages: body.messages,
    max_completion_tokens: 12_000,
  };
  if (body.jsonObject) openAiBody.response_format = { type: "json_object" };
  if (typeof body.temperature === "number") openAiBody.temperature = body.temperature;
  if (body.reasoning_effort !== undefined) openAiBody.reasoning_effort = body.reasoning_effort;
  const result = await requestManagedChat(provider, openAiBody, model);
  await finishAiRequest(requestId, {
    requested_model: body.model, effective_model: result.model, provider: provider.kind,
    outcome: result.errorCode ? "failed" : "succeeded", http_status: result.status,
    error_code: result.errorCode, fallback_used: result.fallbackUsed, duration_ms: Date.now() - started,
  });
  if (result.errorCode) return managedFailure(request, result.errorCode);
  return new Response(result.body, { status: result.status, headers: { ...corsHeaders(request), "Content-Type": "application/json" } });

}

async function proxyRecipeResearch(request: Request, userId: string, body: ManagedChatRequest): Promise<Response> {
  if (!body.reportId || typeof body.input !== "string" || !body.input.trim() || body.input.length > 18_000) {
    throw new ApiError(400, "invalid_recipe_research", "The recipe lookup request is invalid.");
  }
  const requestId = await recordAiRequest(userId, body.reportId, "chat");
  const started = Date.now();
  let provider: ManagedAiProvider | undefined;
  try {
    provider = await managedAiProvider();
    const response = await fetch(provider.kind === "gateway" ? "https://ai-gateway.vercel.sh/v1/responses" : "https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.token}`,
        ...(provider.kind === "gateway" ? { "ai-gateway-auth-method": provider.authMethod } : {}) },
      body: JSON.stringify(recipeResearchPayload(body.input, provider.kind === "gateway")),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      const code = failureCode(response.status, await response.text());
      await finishAiRequest(requestId, { requested_model: "gpt-5.4-mini", effective_model: "gpt-5.4-mini", provider: provider.kind,
        outcome: "failed", http_status: response.status, error_code: code, fallback_used: false, duration_ms: Date.now() - started });
      return json(request, { error: "recipe_research_unavailable" }, 502);
    }
    const result = await response.json();
    // Require actual search execution and tool-provided citations before calling this research.
    parseRecipeResearch(result);
    await finishAiRequest(requestId, { requested_model: "gpt-5.4-mini", effective_model: "gpt-5.4-mini", provider: provider.kind,
      outcome: "succeeded", http_status: 200, error_code: null, fallback_used: false, duration_ms: Date.now() - started });
    return json(request, result);
  } catch (error) {
    const failure = providerException(error);
    await finishAiRequest(requestId, { requested_model: "gpt-5.4-mini", effective_model: "gpt-5.4-mini", provider: provider?.kind ?? "gateway",
      outcome: "failed", http_status: failure.status, error_code: provider ? failure.code : "configuration_error", fallback_used: false, duration_ms: Date.now() - started });
    return json(request, { error: "recipe_research_unavailable" }, 502);
  }
}

async function proxyTranscription(request: Request, userId: string): Promise<Response> {
  const form = await request.formData();
  const reportId = String(form.get("reportId") || "");
  const model = String(form.get("model") || "");
  const file = form.get("file");
  if (!reportId || !TRANSCRIPTION_MODELS.has(model) || !(file instanceof File)) {
    throw new ApiError(400, "invalid_transcription_request", "The managed transcription request is invalid.");
  }
  if (file.size > 4_000_000) throw new ApiError(413, "audio_chunk_too_large", "The audio chunk is too large.");
  const requestId = await recordAiRequest(userId, reportId, "transcription");
  const started = Date.now();
  let provider: ManagedAiProvider | undefined;
  try {
    provider = await managedAiProvider();
    let result: Record<string, unknown>;
    if (provider.kind === "gateway") {
      const gateway = createGateway({ apiKey: provider.token, headers: { "ai-gateway-auth-method": provider.authMethod } });
      const transcript = await transcribe({
        model: gateway.transcription(`openai/${model}`),
        audio: new Uint8Array(await file.arrayBuffer()), maxRetries: 1, abortSignal: AbortSignal.timeout(90_000),
      });
      result = { text: transcript.text, language: transcript.language, duration: transcript.durationInSeconds };
    } else {
      const upstreamForm = new FormData();
      upstreamForm.append("model", model);
      upstreamForm.append("file", file, file.name || "chunk.wav");
      upstreamForm.append("response_format", "json");
      const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: `Bearer ${provider.token}` }, body: upstreamForm,
        signal: AbortSignal.timeout(90_000),
      });
      const raw = await upstream.text();
      if (!upstream.ok) {
        const code = failureCode(upstream.status, raw);
        await finishAiRequest(requestId, { requested_model: model, effective_model: model, provider: provider.kind, outcome: "failed", http_status: upstream.status, error_code: code, fallback_used: false, duration_ms: Date.now() - started });
        return managedFailure(request, code);
      }
      result = JSON.parse(raw);
    }
    if (typeof result.text !== "string") throw new Error("Invalid transcription response");
    await finishAiRequest(requestId, { requested_model: model, effective_model: model, provider: provider.kind, outcome: "succeeded", http_status: 200, error_code: null, fallback_used: false, duration_ms: Date.now() - started });
    return json(request, result);
  } catch (error) {
    const failure = providerException(error);
    const status = failure.status;
    const code = !provider ? "configuration_error" : failure.code;
    await finishAiRequest(requestId, { requested_model: model, effective_model: model, provider: provider?.kind || "gateway", outcome: "failed", http_status: status, error_code: code, fallback_used: false, duration_ms: Date.now() - started });
    return managedFailure(request, code);
  }

}

function managedFailure(request: Request, code: string): Response {
  const message = "Managed AI could not finish this request. Please retry your scan; failed reports do not use your report allowance.";
  return json(request, { error: { code, message }, message }, 502);
}

export async function handler(request: Request): Promise<Response> {
  const preflight = options(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  try {
    const user = await authenticate(request);
    if (user.source !== "extension") {
      throw new ApiError(403, "extension_session_required", "Managed AI is available through the VideoLens extension.");
    }
    const contentType = request.headers.get("content-type") || "";
    return contentType.includes("multipart/form-data")
      ? await proxyTranscription(request, user.id)
      : await proxyChat(request, user.id);
  } catch (error) {
    return errorResponse(request, error);
  }
}

export default { fetch: handler };
