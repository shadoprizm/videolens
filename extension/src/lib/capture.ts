// Captures video from the active tab: metadata probe, frame sampling via
// canvas seek-and-restore, and YouTube caption extraction. All page-side code
// is injected with chrome.scripting (activeTab grant), so the extension needs
// no broad host permissions.
import { DEFAULTS } from "./config";
import type { CapturedFrame, SourceInfo, Transcript, TranscriptSegment } from "./types";

export class CaptureError extends Error {}

export interface TabProbe {
  duration: number;
  title: string;
  pageUrl: string;
  isYouTube: boolean;
  width: number;
  height: number;
}

export async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new CaptureError("No active tab found.");
  if (!tab.url || !/^https?:/.test(tab.url)) {
    throw new CaptureError("This page can't be captured. Open a page with a video and click the VideoLens toolbar icon there.");
  }
  return tab.id;
}

export async function probeTabVideo(tabId: number): Promise<TabProbe> {
  const result = await exec(tabId, () => {
    const videos = Array.from(document.querySelectorAll("video"));
    const playable = videos
      .filter((v) => v.readyState >= 1 && (v.duration > 0 || v.videoWidth > 0))
      .sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight);
    const v = playable[0];
    if (!v) return null;
    return {
      duration: Number.isFinite(v.duration) ? v.duration : 0,
      title: document.title,
      pageUrl: location.href,
      isYouTube: /(^|\.)youtube\.com$/.test(location.hostname) || /(^|\.)youtu\.be$/.test(location.hostname),
      width: v.videoWidth,
      height: v.videoHeight,
    };
  });
  if (!result) {
    throw new CaptureError("No video found on this page. Make sure the video has started loading, then try again.");
  }
  if (result.duration <= 0) {
    throw new CaptureError("The video on this page has no seekable duration (live streams aren't supported).");
  }
  return result;
}

export function planFrameTimestamps(duration: number, maxFrames: number, intervalSeconds: number): number[] {
  // Adaptive interval, mirroring the Python extractor: widen the interval if
  // needed so the frame count respects maxFrames.
  const interval = Math.max(intervalSeconds, duration / Math.max(1, maxFrames));
  const timestamps: number[] = [];
  for (let t = 0; t < duration && timestamps.length < maxFrames; t += interval) {
    timestamps.push(Math.min(t, Math.max(0, duration - 0.1)));
  }
  if (timestamps.length === 0) timestamps.push(0);
  return timestamps;
}

export async function captureTabFrames(
  tabId: number,
  timestamps: number[],
  jpegQuality: number,
  maxEdgePx: number,
): Promise<CapturedFrame[]> {
  const result = await exec(
    tabId,
    async (stamps: number[], quality: number, maxEdge: number) => {
      const videos = Array.from(document.querySelectorAll("video"))
        .filter((v) => v.readyState >= 1 && v.videoWidth > 0)
        .sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight);
      const v = videos[0];
      if (!v) return { error: "video disappeared" };

      const restore = { t: v.currentTime, paused: v.paused };
      v.pause();

      const scale = Math.min(1, maxEdge / Math.max(v.videoWidth, v.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return { error: "canvas unavailable" };

      const seekTo = (t: number) =>
        new Promise<void>((resolve) => {
          const done = () => {
            v.removeEventListener("seeked", done);
            clearTimeout(timer);
            // Give the frame one paint tick to land on the element.
            requestAnimationFrame(() => setTimeout(resolve, 50));
          };
          const timer = setTimeout(done, 3000);
          v.addEventListener("seeked", done);
          v.currentTime = t;
        });

      const frames: { timestamp: number; dataUrl: string }[] = [];
      let taintError: string | null = null;
      for (const t of stamps) {
        await seekTo(t);
        try {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          frames.push({ timestamp: t, dataUrl: canvas.toDataURL("image/jpeg", quality) });
        } catch (e) {
          taintError = String(e);
          break;
        }
      }

      v.currentTime = restore.t;
      if (!restore.paused) void v.play().catch(() => undefined);

      if (frames.length === 0 && taintError) {
        return {
          error:
            "This site blocks frame capture (cross-origin or DRM-protected video). " +
            "Try a YouTube video or a local file instead.",
        };
      }
      return { frames };
    },
    [timestamps, jpegQuality, maxEdgePx],
  );

  if (!result || "error" in result) {
    throw new CaptureError(result?.error ?? "Frame capture failed.");
  }
  return result.frames;
}

// ── YouTube captions ────────────────────────────────────────────────────────
// Runs in the page's MAIN world so it can read ytInitialPlayerResponse and
// fetch the timedtext track from the page's own origin.

interface CaptionResult {
  language: string | null;
  segments: TranscriptSegment[];
  error?: string;
}

export async function fetchYouTubeCaptions(tabId: number): Promise<Transcript | null> {
  let result: CaptionResult | null = null;
  try {
    result = await exec(
      tabId,
      async () => {
        const w = window as unknown as Record<string, any>;
        let tracks: any[] | undefined =
          w.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (!tracks?.length) {
          // SPA navigation can leave ytInitialPlayerResponse stale; fall back
          // to scraping the latest player response from the document.
          const html = document.documentElement.innerHTML;
          const m = html.match(/"captionTracks":(\[.*?\])(?=,")/);
          if (m) {
            try {
              tracks = JSON.parse(m[1]);
            } catch {
              /* ignore */
            }
          }
        }
        if (!tracks?.length) return { language: null, segments: [], error: "no_tracks" };

        const preferred =
          tracks.find((t: any) => !t.kind && (t.languageCode ?? "").startsWith("en")) ??
          tracks.find((t: any) => (t.languageCode ?? "").startsWith("en")) ??
          tracks[0];

        const url = `${preferred.baseUrl}&fmt=json3`;
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) return { language: null, segments: [], error: `fetch_${res.status}` };
        const data = await res.json();

        const segments: { start: number; end: number; text: string }[] = [];
        for (const ev of data.events ?? []) {
          if (!ev.segs) continue;
          const text = ev.segs
            .map((s: any) => s.utf8 ?? "")
            .join("")
            .replace(/\s+/g, " ")
            .trim();
          if (!text) continue;
          const start = (ev.tStartMs ?? 0) / 1000;
          const dur = (ev.dDurationMs ?? 2000) / 1000;
          segments.push({ start, end: start + dur, text });
        }
        return { language: preferred.languageCode ?? null, segments };
      },
      [],
      "MAIN",
    );
  } catch {
    return null;
  }

  if (!result || result.segments.length === 0) return null;
  return { language: result.language, segments: result.segments };
}

export function makeTabSource(probe: TabProbe, hasTranscript: boolean): SourceInfo {
  const limitations: string[] = [];
  if (!hasTranscript) {
    limitations.push(
      probe.isYouTube
        ? "No caption track available — analysis is based on visual frames only."
        : "Audio was not transcribed for in-page videos — analysis is based on visual frames only.",
    );
  }
  return {
    sourceType: probe.isYouTube ? "youtube" : "tab_video",
    title: probe.title || null,
    url: probe.pageUrl,
    durationSeconds: probe.duration,
    limitations,
  };
}

// chrome.scripting.executeScript wrapper. Injected functions must be
// self-contained (they are serialized into the page).
async function exec<T>(
  tabId: number,
  func: (...args: any[]) => T | Promise<T>,
  args: any[] = [],
  world: "ISOLATED" | "MAIN" = "ISOLATED",
): Promise<T> {
  let results: chrome.scripting.InjectionResult[];
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      world,
      func,
      args,
    });
  } catch (e) {
    throw new CaptureError(
      "Can't access this tab. Click the VideoLens toolbar icon on the tab with the video, then retry. " +
        `(${(e as Error).message})`,
    );
  }
  return results?.[0]?.result as T;
}

export const FRAME_DEFAULTS = DEFAULTS;
