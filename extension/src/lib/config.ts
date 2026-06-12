// Mirrors src/videolens/config.py — keep model ids in sync with the Python pipeline.
export const MODELS = {
  transcribe: "gpt-4o-mini-transcribe",
  frameDescribe: "gpt-5.4-mini",
  synthesize: "gpt-5.5",
};

export const DEFAULTS = {
  maxFrames: 40,
  frameIntervalSeconds: 5.0,
  transcriptionChunkSeconds: 30,
  transcriptionSampleRate: 16000,
  frameJpegQuality: 0.7,
  maxFrameEdgePx: 1280,
};

export const TRIAL_ANALYSES = 3;

// Lemon Squeezy product wiring. The license API endpoints are public (no API
// key needed from the extension). TODO: fill these in once the store exists.
export const LEMON = {
  storeId: 0, // e.g. 12345 — from the Lemon Squeezy dashboard
  productId: 0, // e.g. 67890
  checkoutUrl: "https://videolens.lemonsqueezy.com/buy/REPLACE_WITH_VARIANT_UUID",
};

export const LINKS = {
  site: "https://videolens.io",
  privacy: "https://videolens.io/privacy.html",
  github: "https://github.com/shadoprizm/videolens",
  openaiKeys: "https://platform.openai.com/api-keys",
};
