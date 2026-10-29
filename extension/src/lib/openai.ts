// Minimal OpenAI client over fetch — the user's key never leaves the browser
// except to api.openai.com.

import { parseRecipeResearch, recipeResearchPayload, type RecipeResearch } from "./recipeResearch";

const BASE = "https://api.openai.com/v1";
const PRO_BASE = "https://videolens.io/api/ai";

export class OpenAIError extends Error {}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export type AiAccess =
  | { kind: "byok"; apiKey: string }
  | { kind: "pro"; token: string; reportId: string; mode?: string };

export async function chatCompletion(
  access: AiAccess,
  model: string,
  messages: ChatMessage[],
  opts: { jsonObject?: boolean; reasoningEffort?: ReasoningEffort; purpose?: "frames" | "report" | "followup" } = {},
): Promise<string> {
  const body: Record<string, unknown> = { model, messages };
  if (access.kind === "pro") {
    body.kind = "chat";
    body.processingPolicy = "managed-providers-2026-10";
    body.analysisMode = access.mode;
    body.purpose = opts.purpose || "report";
    body.reportId = access.reportId;
    body.jsonObject = Boolean(opts.jsonObject);
  } else if (opts.jsonObject) body.response_format = { type: "json_object" };
  if (opts.reasoningEffort !== undefined) body.reasoning_effort = opts.reasoningEffort;

  const res = await fetch(access.kind === "byok" ? `${BASE}/chat/completions` : PRO_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access.kind === "byok" ? access.apiKey : access.token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new OpenAIError(`${model}: ${res.status} ${await safeErrorText(res)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

export async function transcribeChunk(
  access: AiAccess,
  model: string,
  wav: Blob,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append("model", model);
  form.append("file", wav, filename);
  form.append("response_format", "json");
  if (access.kind === "pro") form.append("reportId", access.reportId);

  const res = await fetch(access.kind === "byok" ? `${BASE}/audio/transcriptions` : PRO_BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${access.kind === "byok" ? access.apiKey : access.token}` },
    body: form,
  });
  if (!res.ok) {
    throw new OpenAIError(`${model}: ${res.status} ${await safeErrorText(res)}`);
  }
  const data = await res.json();
  return (data?.text ?? "").trim();
}

export async function analyzeSoundChunk(access: AiAccess, wav: Blob): Promise<{ windows: { start: number; end: number; description: string; confidence: "medium" | "low" }[] }> {
  if (access.kind !== "pro") throw new OpenAIError("Sound analysis requires Managed mode.");
  const form = new FormData();
  form.append("kind", "sound"); form.append("processingPolicy", "managed-sounds-2026-10");
  form.append("reportId", access.reportId); form.append("file", wav, "sound.wav");
  const res = await fetch(PRO_BASE, { method: "POST", headers: { Authorization: `Bearer ${access.token}` }, body: form, signal: AbortSignal.timeout(290_000) });
  if (!res.ok) throw new OpenAIError(`Sound analysis failed: ${await safeErrorText(res)}`);
  const data = await res.json();
  if (!Array.isArray(data.windows)) throw new OpenAIError("No valid sound evidence was returned.");
  return data;
}

export async function researchRecipe(access: AiAccess, input: string): Promise<RecipeResearch> {
  const res = await fetch(access.kind === "byok" ? `${BASE}/responses` : PRO_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${access.kind === "byok" ? access.apiKey : access.token}` },
    body: JSON.stringify(access.kind === "byok" ? recipeResearchPayload(input) : { kind: "recipe_research", reportId: access.reportId, input }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new OpenAIError("Online recipe lookup is unavailable.");
  return parseRecipeResearch(await res.json());
}

export async function verifyApiKey(apiKey: string): Promise<boolean> {
  const res = await fetch(`${BASE}/models?limit=1`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function safeErrorText(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error?.message ?? JSON.stringify(data).slice(0, 200);
  } catch {
    return res.statusText;
  }
}
