import { createGateway } from "@ai-sdk/gateway";
import { transcribe, NoTranscriptGeneratedError } from "ai";
import { failureCode, providerException, type AiFailureCode, type ManagedAiProvider } from "./managed-ai.js";

// Published clients keep working while the new extension rolls through both stores.
export function managedTranscriptionModel(_requested: string): string { return "gpt-transcribe"; }

export async function requestManagedTranscription(provider: ManagedAiProvider, file: File, model: string): Promise<{
  result: Record<string, unknown> | null; status: number | null; errorCode: AiFailureCode | null;
}> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let status: number | null = null;
    let code: AiFailureCode;
    try {
      let result: Record<string, unknown>;
      if (provider.kind === "gateway") {
        const gateway = createGateway({ apiKey: provider.token, headers: { "ai-gateway-auth-method": provider.authMethod } });
        const value = await transcribe({ model: gateway.transcription(`openai/${model}`),
          audio: new Uint8Array(await file.arrayBuffer()), maxRetries: 0, abortSignal: AbortSignal.timeout(90_000) });
        result = { text: value.text, language: value.language, duration: value.durationInSeconds };
      } else {
        const form = new FormData(); form.append("model", model); form.append("file", file, file.name || "chunk.wav");
        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST", headers: { Authorization: `Bearer ${provider.token}` }, body: form, signal: AbortSignal.timeout(90_000),
        });
        status = response.status;
        const raw = await response.text();
        if (!response.ok) {
          const errorCode = failureCode(status, raw);
          if (attempt === 0 && (status === 429 || status >= 500)) { await pause(response.headers.get("retry-after")); continue; }
          return { result: null, status, errorCode };
        }
        result = JSON.parse(raw);
      }
      if (typeof result.text !== "string") return { result: null, status, errorCode: "invalid_provider_response" };
      return { result, status: 200, errorCode: null };
    } catch (error) {
      // File transcription validates the provider's required text string, then
      // the SDK throws this error for text="". A clip without recognized words
      // is a valid result, not a transport failure or reason to bill a retry.
      if (NoTranscriptGeneratedError.isInstance(error)) {
        return { result: { text: "" }, status: 200, errorCode: null };
      }
      const failure = providerException(error); status = failure.status; code = failure.code;
      if (attempt === 0 && ["network_error", "request_timeout", "provider_unavailable", "rate_limited"].includes(code)) { await pause(); continue; }
      return { result: null, status, errorCode: code };
    }
  }
  return { result: null, status: null, errorCode: "provider_unavailable" };
}

async function pause(retryAfter: string | null = null): Promise<void> {
  const seconds = Number(retryAfter);
  await new Promise(resolve => setTimeout(resolve, retryAfter && Number.isFinite(seconds) ? Math.max(1000, Math.min(30_000, seconds * 1000)) : 1000));
}
