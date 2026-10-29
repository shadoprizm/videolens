// A seek event alone is not a decoded frame. Initial/unchanged positions may
// produce loadeddata instead, and detached/background video has no paint tick.
export class VideoFrameTimeout extends Error {}

export function seekVideoFrame(video: HTMLVideoElement, time: number, timeoutMs = 30_000): Promise<void> {
  const target = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.01)));
  const ready = () => !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.075;
  return new Promise((resolve, reject) => {
    const events = ["loadeddata", "canplay", "seeked", "timeupdate", "progress"];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(poll);
      for (const event of events) video.removeEventListener(event, check);
      video.removeEventListener("error", failed);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      error ? reject(error) : resolve();
    };
    const failed = () => finish(new Error("The browser could not decode this video. The file may be damaged or use an unsupported codec."));
    const check = () => {
      if (video.error) failed();
      else if (ready()) finish();
    };
    for (const event of events) video.addEventListener(event, check);
    video.addEventListener("error", failed);
    // Keep a bounded stall guard, but do not fail a working decoder after 3s.
    // Polling also handles browsers which omit a media event for the same time.
    poll = setInterval(check, 100);
    timer = setTimeout(() => ready() ? finish() : finish(new VideoFrameTimeout(
      `The browser stopped decoding the video near ${target.toFixed(2)} seconds.`,
    )), timeoutMs);
    try {
      if (Math.abs(video.currentTime - target) >= 0.075) video.currentTime = target;
      check();
    } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
}
