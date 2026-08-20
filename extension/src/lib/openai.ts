// Minimal OpenAI client over fetch — the user's key never leaves the browser
// except to api.openai.com.

const BASE = "https://api.openai.com/v1";

export class OpenAIError extends Error {}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export async function chatCompletion(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  opts: { jsonObject?: boolean; reasoningEffort?: ReasoningEffort } = {},
): Promise<string> {
  const body: Record<string, unknown> = { model, messages };
  if (opts.jsonObject) body.response_format = { type: "json_object" };
  if (opts.reasoningEffort !== undefined) body.reasoning_effort = opts.reasoningEffort;

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
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
  apiKey: string,
  model: string,
  wav: Blob,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append("model", model);
  form.append("file", wav, filename);
  form.append("response_format", "json");

  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new OpenAIError(`${model}: ${res.status} ${await safeErrorText(res)}`);
  }
  const data = await res.json();
  return (data?.text ?? "").trim();
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
