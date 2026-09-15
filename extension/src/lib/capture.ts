// Captures video from the active tab: metadata probe, frame sampling via
// canvas seek-and-restore, and YouTube caption extraction. All page-side code
// is injected with chrome.scripting (activeTab grant), so the extension needs
// no broad host permissions.
import { DEFAULTS } from "./config";
import type { CapturedFrame, SourceInfo, Transcript, TranscriptSegment } from "./types";

export class CaptureError extends Error {}

const YOUTUBE_HOST_PERMISSION = "https://*.youtube.com/*";

export interface TabProbe {
  duration: number;
  title: string;
  pageUrl: string;
  isYouTube: boolean;
  width: number;
  height: number;
}

// The sidebar can be opened from the browser's sidebar picker, which does not
// grant activeTab. YouTube is the extension's primary source, so request a
// narrow, optional YouTube permission when the browser has not exposed the
// current tab to us. This happens directly from the Analyze click and is
// remembered after the user approves it once.
export async function ensureTabCapturePermission(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new CaptureError("No active tab found.");

  if (tab.url) {
    if (/^https?:/.test(tab.url)) return;
    throw new CaptureError("This browser page can't be analyzed. Open a YouTube video and try again.");
  }

  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [YOUTUBE_HOST_PERMISSION] });
  } catch {
    // A rejected permissions request is handled by the same user-facing error.
  }
  if (!granted) {
    throw new CaptureError("VideoLens needs access to YouTube to analyze this video. Choose Allow when your browser asks, then try again.");
  }

  const [refreshedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!refreshedTab?.url || !/^https?:/.test(refreshedTab.url)) {
    throw new CaptureError("VideoLens still can't access this tab. Make sure the YouTube video tab is selected, then try again.");
  }
}

export async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new CaptureError("No active tab found.");
  return tab.id;
}

export async function probeTabVideo(tabId: number): Promise<TabProbe> {
  const result = await exec(tabId, () => {
    const activeShorts = Array.from(document.querySelectorAll<HTMLVideoElement>('ytd-reel-video-renderer[is-active]:not([is-active="false"]) video'));
    const videos = activeShorts.length ? activeShorts : Array.from(document.querySelectorAll("video"));
    const playable = videos
      .filter((v) => v.readyState >= 1 && (v.duration > 0 || v.videoWidth > 0))
      .sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight);
    const v = playable[0];
    if (!v) return null;
    const isYouTube = /(^|\.)youtube\.com$/.test(location.hostname) || /(^|\.)youtu\.be$/.test(location.hostname);
    // YouTube puts notification counts in document.title. Prefer the visible
    // video heading, including after client-side navigation to another video.
    const heading = isYouTube ? document.querySelector("ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata, #title h1 yt-formatted-string")?.textContent?.trim() : null;
    const title = heading || (isYouTube
      ? document.title.replace(/\s[-–—]\sYouTube\s*$/i, "").replace(/^\(\d[\d,.]*\)\s+/, "").trim()
      : document.title);
    return {
      duration: Number.isFinite(v.duration) ? v.duration : 0,
      title,
      pageUrl: location.href,
      isYouTube,
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
      const activeShorts = Array.from(document.querySelectorAll<HTMLVideoElement>('ytd-reel-video-renderer[is-active]:not([is-active="false"]) video'));
      const videos = (activeShorts.length ? activeShorts : Array.from(document.querySelectorAll("video")))
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
        new Promise<boolean>((resolve) => {
          const ready = () => !v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - t) < 0.1;
          if (ready()) { resolve(true); return; }
          const done = () => {
            v.removeEventListener("seeked", done);
            clearTimeout(timer);
            // Give the frame one paint tick to land on the element.
            requestAnimationFrame(() => setTimeout(() => resolve(ready()), 50));
          };
          const timer = setTimeout(() => {
            v.removeEventListener("seeked", done);
            resolve(false);
          }, 3000);
          v.addEventListener("seeked", done);
          v.currentTime = t;
        });

      const frames: { timestamp: number; dataUrl: string }[] = [];
      let taintError: string | null = null;
      for (const t of stamps) {
        if (!await seekTo(t)) continue;
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

export async function fetchYouTubeCaptions(
  tabId: number,
  preferredLanguage?: string | null,
): Promise<Transcript | null> {
  let result: CaptionResult | null = null;
  try {
    result = await exec(
      tabId,
      async (requestedLanguage: string | null) => {
        const w = window as unknown as Record<string, any>;
        const page = new URL(location.href);
        const videoId = page.searchParams.get("v") || page.pathname.match(/^\/shorts\/([^/]+)/)?.[1];
        const activeShort = document.querySelector('ytd-reel-video-renderer[is-active]:not([is-active="false"])');
        const player = activeShort?.querySelector("#movie_player") ?? document.querySelector("#movie_player");
        const response = (player as any)?.getPlayerResponse?.() ?? w.ytInitialPlayerResponse;
        // Never use stale captions from another item in a Shorts feed or an SPA navigation.
        if (!videoId || response?.videoDetails?.videoId !== videoId) return { language: null, segments: [], error: "stale_player" };
        const tracks: any[] | undefined = response.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!tracks?.length) return { language: null, segments: [], error: "no_tracks" };

        const normalize = (value: unknown) => String(value ?? "").replace(/_/g, "-").toLowerCase();
        const requested = normalize(requestedLanguage);
        const matchesRequested = (track: any) => {
          const trackLanguage = normalize(track.languageCode);
          if (!requested || !trackLanguage) return false;
          if (requested.startsWith("zh")) {
            const wantsTraditional = /(?:^|-)(?:tw|hk|mo|hant)(?:-|$)/.test(requested);
            const trackTraditional = /(?:^|-)(?:tw|hk|mo|hant)(?:-|$)/.test(trackLanguage);
            return trackLanguage.startsWith("zh") && wantsTraditional === trackTraditional;
          }
          return trackLanguage === requested || trackLanguage.startsWith(`${requested.split("-")[0]}-`);
        };

        // Match the user's requested report language when possible. Otherwise
        // prefer a human-authored track in the video's own language. This
        // replaces the old English-first behavior that disadvantaged Chinese
        // and other non-English videos.
        const preferred =
          tracks.find((track: any) => !track.kind && matchesRequested(track)) ??
          tracks.find((track: any) => matchesRequested(track)) ??
          tracks.find((track: any) => !track.kind) ??
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
      [preferredLanguage ?? null],
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

// Read creator metadata only when it belongs to the current video. Shorts feeds
// keep other videos in the DOM, so a page-wide description lookup can be stale.
export async function fetchRecipeCreatorText(tabId: number): Promise<string> {
  return exec(tabId, () => {
    if (!/(^|\.)youtube\.com$/.test(location.hostname)) return "";
    const url = new URL(location.href);
    const videoId = url.searchParams.get("v") || url.pathname.match(/^\/shorts\/([^/]+)/)?.[1];
    const w = window as any;
    const activeShort = document.querySelector('ytd-reel-video-renderer[is-active]:not([is-active="false"])');
    const player = activeShort?.querySelector("#movie_player") ?? document.querySelector("#movie_player");
    const response = (player as any)?.getPlayerResponse?.() ?? w.ytInitialPlayerResponse;
    if (!videoId || response?.videoDetails?.videoId !== videoId) return "";
    return typeof response.videoDetails.shortDescription === "string" ? response.videoDetails.shortDescription.slice(0, 12_000) : "";
  }, [], "MAIN");
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
      "VideoLens can't access this tab. Select the video tab, reopen VideoLens from your browser's Extensions menu, then retry. " +
        `(${(e as Error).message})`,
    );
  }
  return results?.[0]?.result as T;
}

export const FRAME_DEFAULTS = DEFAULTS;
