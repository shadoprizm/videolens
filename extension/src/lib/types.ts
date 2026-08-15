export type Confidence = "high" | "medium" | "low";

export type AnalysisMode =
  | "general"
  | "bug"
  | "meeting"
  | "ux"
  | "tutorial"
  | "product_demo"
  | "content"
  | "privacy";

export type SourceType = "tab_video" | "youtube" | "local_file";

export interface SourceInfo {
  sourceType: SourceType;
  title: string | null;
  url: string | null;
  durationSeconds: number | null;
  limitations: string[];
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string | null;
}

export interface Transcript {
  language: string | null;
  segments: TranscriptSegment[];
}

export interface CapturedFrame {
  timestamp: number;
  dataUrl: string;
}

export interface FrameSummary {
  timestamp: number;
  visualSummary: string;
  detectedContext: string[];
  extractedText: string[];
  confidence: Confidence;
}

export interface TimelineSegment {
  start: number;
  end: number;
  sceneType: string | null;
  transcript: string | null;
  ocr: string[];
  visualSummary: string | null;
  confidence: Confidence;
}

export interface Timeline {
  segments: TimelineSegment[];
}

export interface Evidence {
  timestamp: number;
  detail: string;
}

export interface Finding {
  finding: string;
  evidence: Evidence[];
  confidence: Confidence;
}

export interface Recommendation {
  recommendation: string;
  rationale: string | null;
  confidence: Confidence;
}

export interface AnalysisTask {
  title: string;
  detail: string | null;
}

export interface Analysis {
  source: SourceInfo;
  mode: AnalysisMode;
  prompt: string;
  summary: string;
  timeline: Timeline;
  findings: Finding[];
  recommendations: Recommendation[];
  tasks: AnalysisTask[];
  limitations: string[];
  confidence: Confidence;
}

export interface QaEntry {
  question: string;
  answer: string;
}
