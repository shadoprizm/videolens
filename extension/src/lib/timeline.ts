// Port of src/videolens/processors/build_timeline.py
import type {
  FrameSummary,
  Timeline,
  TimelineSegment,
  Transcript,
  TranscriptSegment,
} from "./types";

export function buildTimeline(
  frameSummaries: FrameSummary[],
  transcript: Transcript | null,
  durationSeconds: number | null,
): Timeline {
  const hasTranscript = transcript !== null && transcript.segments.length > 0;
  if (frameSummaries.length === 0 && !hasTranscript) {
    return { segments: [] };
  }

  if (frameSummaries.length === 0) {
    return {
      segments: transcript!.segments.map((s) => ({
        start: s.start,
        end: s.end,
        sceneType: null,
        transcript: speakerText(s),
        ocr: [],
        visualSummary: null,
        confidence: "medium" as const,
      })),
    };
  }

  const sorted = [...frameSummaries].sort((a, b) => a.timestamp - b.timestamp);
  const endAnchor = durationSeconds ?? sorted[sorted.length - 1].timestamp + 1.0;

  const segments: TimelineSegment[] = sorted.map((frame, i) => {
    const start = frame.timestamp;
    let end = i + 1 < sorted.length ? sorted[i + 1].timestamp : endAnchor;
    if (end <= start) end = start + 0.001;
    return {
      start,
      end,
      sceneType: inferSceneType(frame.detectedContext),
      transcript: hasTranscript ? collectTranscript(transcript!, start, end) : null,
      ocr: [...frame.extractedText],
      visualSummary: frame.visualSummary || null,
      confidence: frame.confidence,
    };
  });

  return { segments };
}

function collectTranscript(transcript: Transcript, start: number, end: number): string | null {
  const pieces: string[] = [];
  for (const seg of transcript.segments) {
    if (seg.end < start || seg.start >= end) continue;
    pieces.push(speakerText(seg));
  }
  const text = pieces.filter(Boolean).join(" ").trim();
  return text || null;
}

function speakerText(seg: TranscriptSegment): string {
  return seg.speaker ? `${seg.speaker}: ${seg.text}`.trim() : seg.text.trim();
}

function inferSceneType(tags: string[]): string | null {
  if (tags.length === 0) return null;
  const priority = [
    "terminal",
    "code",
    "browser",
    "web_app",
    "dashboard",
    "slide deck",
    "meeting",
    "video call",
    "screen recording",
  ];
  const lowered = tags.map((t) => t.toLowerCase());
  for (const needle of priority) {
    for (const tag of lowered) {
      if (tag.includes(needle)) return tag;
    }
  }
  return lowered[0];
}
