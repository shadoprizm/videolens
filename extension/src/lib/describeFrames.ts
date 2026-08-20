// Port of src/videolens/processors/describe_frames.py
import { MODELS } from "./config";
import { chatCompletion } from "./openai";
import type { CapturedFrame, Confidence, FrameSummary } from "./types";

const SYSTEM_PROMPT =
  "You are a video frame analyst. Given a single frame, return a JSON object " +
  "describing what is visible. Combine visual interpretation with OCR — read any " +
  "text on screen. Be specific, terse, and factual. Avoid speculation; if unsure, " +
  "say so via the confidence field.";

const USER_PROMPT =
  "Describe this frame. Return strict JSON with keys:\n" +
  "  visual_summary: 1–2 sentences on what is happening / what is on screen.\n" +
  "  detected_context: array of short tags (e.g. 'browser', 'terminal', 'meeting', 'screen recording', 'outdoor', 'slide deck').\n" +
  "  extracted_text: array of distinct visible text strings (UI labels, code, commands, error messages, URLs). Empty array if no readable text.\n" +
  "  confidence: 'high' | 'medium' | 'low' — how confident you are in the description.\n" +
  "Do not include any keys other than these. Do not wrap in markdown.";

export async function describeFrames(
  apiKey: string,
  frames: CapturedFrame[],
  onProgress: (done: number, total: number) => void,
  maxWorkers = 5,
): Promise<FrameSummary[]> {
  const results: (FrameSummary | null)[] = new Array(frames.length).fill(null);
  let next = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (next < frames.length) {
      const idx = next++;
      try {
        results[idx] = await describeOne(apiKey, frames[idx]);
      } catch {
        // Skip failed frames, like the Python pipeline does.
      }
      done += 1;
      onProgress(done, frames.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(maxWorkers, frames.length) }, () => worker()),
  );
  return results.filter((r): r is FrameSummary => r !== null);
}

async function describeOne(apiKey: string, frame: CapturedFrame): Promise<FrameSummary> {
  const content = await chatCompletion(
    apiKey,
    MODELS.frameDescribe,
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT },
          {
            type: "image_url",
            image_url: { url: frame.dataUrl, detail: MODELS.frameImageDetail },
          },
        ],
      },
    ],
    { jsonObject: true, reasoningEffort: MODELS.frameReasoningEffort },
  );
  const data = JSON.parse(content || "{}");
  return {
    timestamp: frame.timestamp,
    visualSummary: String(data.visual_summary ?? "").trim(),
    detectedContext: toStrings(data.detected_context),
    extractedText: toStrings(data.extracted_text),
    confidence: coerceConfidence(data.confidence),
  };
}

function toStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((x) => String(x)) : [];
}

export function coerceConfidence(value: unknown): Confidence {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "high" || v === "medium" || v === "low" ? v : "medium";
}
