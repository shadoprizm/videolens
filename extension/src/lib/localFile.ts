// Local-file processing inside the side panel page: frame sampling from an
// offscreen <video>, and audio decode → 16 kHz mono WAV chunks → OpenAI
// transcription. Replaces ffmpeg/yt-dlp from the Python pipeline.
import { DEFAULTS, MODELS } from "./config";
import { transcribeChunk } from "./openai";
import type { CapturedFrame, SourceInfo, Transcript, TranscriptSegment } from "./types";

// decodeAudioData materialises the whole audio track in memory; beyond about
// this duration, decoding risks OOM in the side panel. We degrade to
// frames-only rather than crash.
const TRANSCRIBE_MAX_SECONDS = 20 * 60;

export interface LocalVideo {
  file: File;
  objectUrl: string;
  video: HTMLVideoElement;
  duration: number;
}

export async function openLocalVideo(file: File): Promise<LocalVideo> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.src = objectUrl;

  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener(
      "error",
      () => reject(new Error("Could not open this file as a video (unsupported codec or corrupt file).")),
      { once: true },
    );
  });

  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("This file has no readable duration.");
  }
  return { file, objectUrl, video, duration: video.duration };
}

export function closeLocalVideo(local: LocalVideo): void {
  local.video.src = "";
  URL.revokeObjectURL(local.objectUrl);
}

export async function captureLocalFrames(
  local: LocalVideo,
  timestamps: number[],
  onProgress: (done: number, total: number) => void,
): Promise<CapturedFrame[]> {
  const v = local.video;
  const scale = Math.min(1, DEFAULTS.maxFrameEdgePx / Math.max(v.videoWidth, v.videoHeight, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");

  const frames: CapturedFrame[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    await seek(v, t);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    frames.push({ timestamp: t, dataUrl: canvas.toDataURL("image/jpeg", DEFAULTS.frameJpegQuality) });
    onProgress(i + 1, timestamps.length);
  }
  return frames;
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      clearTimeout(timer);
      requestAnimationFrame(() => setTimeout(resolve, 30));
    };
    const timer = setTimeout(done, 3000);
    v.addEventListener("seeked", done);
    v.currentTime = t;
  });
}

export async function transcribeLocalFile(
  apiKey: string,
  local: LocalVideo,
  onProgress: (done: number, total: number) => void,
): Promise<{ transcript: Transcript | null; limitation: string | null }> {
  if (local.duration > TRANSCRIBE_MAX_SECONDS) {
    return {
      transcript: null,
      limitation: `Audio not transcribed: file longer than ${TRANSCRIBE_MAX_SECONDS / 60} minutes (browser memory limit). Analysis is based on visual frames only.`,
    };
  }

  let audio: AudioBuffer;
  try {
    const bytes = await local.file.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, DEFAULTS.transcriptionSampleRate);
    audio = await ctx.decodeAudioData(bytes);
  } catch {
    return {
      transcript: null,
      limitation: "Audio not transcribed: the audio track could not be decoded in the browser. Analysis is based on visual frames only.",
    };
  }

  const mono = await resampleToMono(audio, DEFAULTS.transcriptionSampleRate);
  const chunkSamples = DEFAULTS.transcriptionChunkSeconds * DEFAULTS.transcriptionSampleRate;
  const chunks: { start: number; end: number; samples: Float32Array }[] = [];
  for (let offset = 0; offset < mono.length; offset += chunkSamples) {
    const slice = mono.subarray(offset, Math.min(offset + chunkSamples, mono.length));
    if (isSilent(slice)) continue;
    chunks.push({
      start: offset / DEFAULTS.transcriptionSampleRate,
      end: (offset + slice.length) / DEFAULTS.transcriptionSampleRate,
      samples: slice,
    });
  }
  if (chunks.length === 0) {
    return { transcript: null, limitation: "Audio not transcribed: no audible audio track found." };
  }

  // Same shape as the Python pipeline: 30s chunks, parallel uploads, chunk
  // boundaries become segment boundaries.
  const segments: (TranscriptSegment | null)[] = new Array(chunks.length).fill(null);
  let next = 0;
  let done = 0;
  async function worker(): Promise<void> {
    while (next < chunks.length) {
      const idx = next++;
      const chunk = chunks[idx];
      try {
        const text = await transcribeChunk(
          apiKey,
          MODELS.transcribe,
          encodeWav(chunk.samples, DEFAULTS.transcriptionSampleRate),
          `chunk-${idx}.wav`,
        );
        if (text) segments[idx] = { start: chunk.start, end: chunk.end, text };
      } catch {
        // A failed chunk leaves a gap; the synthesis model handles gaps.
      }
      done += 1;
      onProgress(done, chunks.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, () => worker()));

  const kept = segments.filter((s): s is TranscriptSegment => s !== null);
  if (kept.length === 0) {
    return { transcript: null, limitation: "Audio not transcribed: all transcription calls failed." };
  }
  return { transcript: { language: null, segments: kept }, limitation: null };
}

async function resampleToMono(audio: AudioBuffer, targetRate: number): Promise<Float32Array> {
  const targetLength = Math.ceil(audio.duration * targetRate);
  const ctx = new OfflineAudioContext(1, Math.max(1, targetLength), targetRate);
  const src = ctx.createBufferSource();
  src.buffer = audio;
  src.connect(ctx.destination);
  src.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

function isSilent(samples: Float32Array): boolean {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 16) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, samples.length / 16));
  return rms < 0.001;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function makeLocalSource(local: LocalVideo, limitations: string[]): SourceInfo {
  return {
    sourceType: "local_file",
    title: local.file.name,
    url: null,
    durationSeconds: local.duration,
    limitations,
  };
}
