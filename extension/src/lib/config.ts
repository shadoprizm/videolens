// Mirrors src/videolens/config.py — keep model ids in sync with the Python pipeline.
export const MODELS = {
  transcribe: "gpt-4o-mini-transcribe",
  frameDescribe: "gpt-5.6-terra",
  synthesize: "gpt-5.6-terra",
  frameReasoningEffort: "none",
  synthesizeReasoningEffort: "medium",
  frameImageDetail: "original",
} as const;

export const DEFAULTS = {
  maxFrames: 40,
  frameIntervalSeconds: 5.0,
  transcriptionChunkSeconds: 30,
  transcriptionSampleRate: 16000,
  frameJpegQuality: 0.7,
  maxFrameEdgePx: 1280,
};

export const LINKS = {
  site: "https://videolens.io",
  privacy: "https://videolens.io/privacy.html",
  github: "https://github.com/shadoprizm/videolens",
  openaiKeys: "https://platform.openai.com/api-keys",
};
