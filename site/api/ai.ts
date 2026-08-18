import { createGateway } from "@ai-sdk/gateway";
import { getVercelOidcToken } from "@vercel/oidc";
import { transcribe } from "ai";
import { authenticate } from "./_lib/auth.js";
import { recordAiRequest } from "./_lib/entitlements.js";
import { optionalEnv } from "./_lib/env.js";
import { ApiError, corsHeaders, errorResponse, json, options } from "./_lib/http.js";

const CHAT_MODELS = new Set(["gpt-5.4-mini", "gpt-5.5"]);
const TRANSCRIPTION_MODELS = new Set(["gpt-4o-mini-transcribe"]);

interface ManagedChatRequest {
  kind?: "chat";
  reportId?: string;
  model?: string;
  messages?: unknown[];
  jsonObject?: boolean;
  temperature?: number;
}

type ManagedAiProvider =
  | { kind: "openai"; token: string }
  | { kind: "gateway"; token: string; authMethod: "api-key" | "oidc" };

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
  if (!body.reportId || !body.model || !CHAT_MODELS.has(body.model) || !Array.isArray(body.messages)) {
    throw new ApiError(400, "invalid_ai_request", "The managed AI request is invalid.");
  }
  const provider = await managedAiProvider();
  await recordAiRequest(userId, body.reportId, "chat");

  const openAiBody: Record<string, unknown> = {
    model: provider.kind === "gateway" ? `openai/${body.model}` : body.model,
    messages: body.messages,
    max_completion_tokens: 12_000,
  };
  if (body.jsonObject) openAiBody.response_format = { type: "json_object" };
  if (typeof body.temperature === "number") openAiBody.temperature = body.temperature;
  const upstream = await fetch(
    provider.kind === "gateway"
      ? "https://ai-gateway.vercel.sh/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions",
    {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.token}`,
      "Content-Type": "application/json",
      ...(provider.kind === "gateway"
        ? {
            "ai-gateway-auth-method": provider.authMethod,
            "ai-gateway-protocol-version": "0.0.1",
          }
        : {}),
    },
    body: JSON.stringify(openAiBody),
    },
  );
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
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
  const provider = await managedAiProvider();
  await recordAiRequest(userId, reportId, "transcription");

  if (provider.kind === "gateway") {
    const gateway = createGateway({
      apiKey: provider.token,
      headers: { "ai-gateway-auth-method": provider.authMethod },
    });
    const result = await transcribe({
      model: gateway.transcription(`openai/${model}`),
      audio: new Uint8Array(await file.arrayBuffer()),
      maxRetries: 2,
    });
    return json(request, {
      text: result.text,
      language: result.language,
      duration: result.durationInSeconds,
    });
  }

  const upstreamForm = new FormData();
  upstreamForm.append("model", model);
  upstreamForm.append("file", file, file.name || "chunk.wav");
  upstreamForm.append("response_format", "json");
  const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.token}` },
    body: upstreamForm,
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
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
