import { guardReportSilence } from "./_lib/report-evidence.js";
import { getVercelOidcToken } from "@vercel/oidc";
import { managedTranscriptionModel, requestManagedTranscription } from "./_lib/transcription.js";
import { authenticate } from "./_lib/auth.js";
import { recordAiRequest } from "./_lib/entitlements.js";
import { optionalEnv } from "./_lib/env.js";
import { providerException, failureCode, finishAiRequest, requestManagedChat, type ManagedAiProvider } from "./_lib/managed-ai.js";
import { ApiError, corsHeaders, errorResponse, json, options } from "./_lib/http.js";
import { parseRecipeResearch, recipeResearchPayload } from "../shared/recipeResearch.js";
import { analyzeSound, readSoundWav, SOUND_MODEL, SOUND_POLICY } from "./_lib/sound.js";

// Keep published clients compatible while routing legacy defaults to the
// current review model. New clients use explicit extraction/review roles.
const CHAT_MODELS = new Set(["gpt-5.4-mini", "gpt-5.5", "gpt-5.6-terra", "gpt-6-luna", "gpt-6-sol"]);
const TRANSCRIPTION_MODELS = new Set(["gpt-4o-mini-transcribe", "gpt-transcribe"]);

export function managedChatModel(requestedModel: string, policy?: string, mode?: string, purpose?: string): string {
  if (policy === "managed-providers-2026-10" && mode === "general") {
    return purpose === "frames" ? "gpt-6-luna" : "zai/glm-5.3-flash";
  }
  // Older clients retain their disclosed OpenAI destination.
  return ["gpt-5.5", "gpt-5.6-terra", "gpt-6-sol"].includes(requestedModel) ? "gpt-6-luna" : requestedModel;
}

export const GENERAL_REVIEW_POLICY = `Review every supplied timestamped image in sequence, including brief changes involving secondary subjects. Destination/route signs identify their visible text, not necessarily the current road, location, organization or ownership. Keep location unconfirmed unless independently established by the supplied evidence. Keep the camera subject separate from other subjects: apparent smooth motion of one does not prove other objects made no abrupt movements. Describe observable position/orientation changes before discussing uncertain contact or causation. Prefer "contact cannot be confirmed from the sampled evidence" to a broad "no incident or abrupt event is visible" when there are ambiguous changes. Review the full supplied time range; do not move an early event to later frames or turn an uncertain object into debris. Treat OCR values as unverified overlay readings. An empty speech transcript is not a silent recording. Never label the source silent merely because no words were recognized. When heard observations are present, describe those sounds separately from speech. For audio, preserve provisional descriptions and distinguish coverage ranges from exact event onsets. Do not recommend checking unlogged sound windows if those windows are already supplied; say the observations are inconclusive when they disagree.`;

export function reviewedMessages(messages: unknown[], generalReview: boolean): unknown[] {
  return generalReview ? [...messages, { role: "system", content: GENERAL_REVIEW_POLICY }] : messages;
}

interface ManagedChatRequest {
  processingPolicy?: string;
  analysisMode?: string;
  purpose?: "frames" | "report" | "followup";
  kind?: "chat" | "recipe_research";
  input?: string;
  reportId?: string;
  model?: string;
  messages?: unknown[];
  jsonObject?: boolean;
  temperature?: number;
  reasoning_effort?: string;
}

async function managedAiProvider(model = ""): Promise<ManagedAiProvider> {
  const openAiKey = optionalEnv("OPENAI_API_KEY");
  if (openAiKey && !model.includes("/")) return { kind: "openai", token: openAiKey };

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
  const model = managedChatModel(body.model, body.processingPolicy, body.analysisMode, body.purpose);
  let provider: ManagedAiProvider;
  try { provider = await managedAiProvider(model); } catch {
    await finishAiRequest(requestId, { requested_model: body.model, effective_model: body.model, provider: "gateway", outcome: "failed", http_status: null, error_code: "configuration_error", fallback_used: false, duration_ms: Date.now() - started });
    return managedFailure(request, "configuration_error");
  }

  const openAiBody: Record<string, unknown> = {
    messages: reviewedMessages(body.messages, body.analysisMode === "general" && body.purpose !== "frames"),
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
  const responseBody = body.analysisMode === "general" && body.purpose !== "frames"
    ? guardReportSilence(result.body, body.messages) : result.body;
  if (responseBody !== result.body) console.info("Managed report evidence normalization", { requestId, rule: "source_silence" });
  return new Response(responseBody, { status: result.status, headers: { ...corsHeaders(request), "Content-Type": "application/json" } });

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
  if (form.get("kind") === "sound") return proxySound(request, userId, form);
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
    const effectiveModel = managedTranscriptionModel(model);
    const response = await requestManagedTranscription(provider, file, effectiveModel);
    await finishAiRequest(requestId, { requested_model: model, effective_model: effectiveModel, provider: provider.kind,
      outcome: response.errorCode ? "failed" : "succeeded", http_status: response.status, error_code: response.errorCode,
      fallback_used: false, duration_ms: Date.now() - started });
    return response.errorCode ? managedFailure(request, response.errorCode) : json(request, response.result);

  } catch (error) {
    const failure = providerException(error);
    const status = failure.status;
    const code = !provider ? "configuration_error" : failure.code;
    await finishAiRequest(requestId, { requested_model: model, effective_model: model, provider: provider?.kind || "gateway", outcome: "failed", http_status: status, error_code: code, fallback_used: false, duration_ms: Date.now() - started });
    return managedFailure(request, code);
  }

}

async function proxySound(request: Request, userId: string, form: FormData): Promise<Response> {
  const reportId = String(form.get("reportId") || ""), file = form.get("file");
  if (form.get("processingPolicy") !== SOUND_POLICY) throw new ApiError(400, "sound_consent_required", "Accept the updated sound processing notice first.");
  if (!reportId || !(file instanceof File) || file.size > 2_880_100) throw new ApiError(400, "invalid_sound_request", "Choose a bounded WAV sound chunk.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  readSoundWav(bytes);
  const requestId = await recordAiRequest(userId, reportId, "sound"), started = Date.now();
  try {
    const result = await analyzeSound(bytes, await managedAiProvider(SOUND_MODEL));
    console.info("Managed sound operation", { requestId, model: SOUND_MODEL, windows: result.windows.length, reportedCostUsd: result.costUsd, durationMs: Date.now() - started });
    await finishAiRequest(requestId, { requested_model: SOUND_MODEL, effective_model: SOUND_MODEL, provider: "gateway", outcome: "succeeded", http_status: 200, error_code: null, fallback_used: false, duration_ms: Date.now() - started });
    return json(request, result);
  } catch (error) {
    const failure = providerException(error);
    const invalidResponse = error instanceof SyntaxError || (error instanceof Error && /Invalid sound|Audio was not analyzed|NoOutput|NoObject|TypeValidation/i.test(`${error.name} ${error.message}`));
    const code = invalidResponse ? "invalid_provider_response" : failure.code;
    console.warn("Managed sound operation failed", { requestId, code, durationMs: Date.now() - started });
    await finishAiRequest(requestId, { requested_model: SOUND_MODEL, effective_model: SOUND_MODEL, provider: "gateway", outcome: "failed", http_status: failure.status, error_code: code, fallback_used: false, duration_ms: Date.now() - started });
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
