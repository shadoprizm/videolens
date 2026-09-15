import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/capture.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const source = bundle.outputFiles[0].text;
const capture = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("Shorts capture selects the active video and skips an unreadable seek", async t => {
  const listeners = new Set(); let position = 0, drawn = 0;
  const video = { readyState: 4, seeking: false, duration: 3, videoWidth: 720, videoHeight: 1280, paused: true,
    pause() {}, addEventListener: (_, f) => listeners.add(f), removeEventListener: (_, f) => listeners.delete(f),
    get currentTime() { return position; }, set currentTime(value) { position = value; this.readyState = 1; queueMicrotask(() => [...listeners].forEach(f => f())); } };
  const old = new Map(["document", "location", "chrome", "requestAnimationFrame"].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  t.after(() => { for (const [k, d] of old) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });
  globalThis.document = {
    title: "Active recipe - YouTube", querySelector: () => null,
    querySelectorAll: selector => selector.includes("is-active") ? [video] : [{ ...video, duration: 999, videoWidth: 4000 }],
    createElement: () => ({ getContext: () => ({ drawImage: () => drawn++ }), toDataURL: () => "data:image/jpeg;base64,AA==" }),
  };
  globalThis.location = { href: "https://www.youtube.com/shorts/current", hostname: "www.youtube.com" };
  globalThis.requestAnimationFrame = f => f();
  globalThis.chrome = { scripting: { executeScript: async ({ func, args }) => [{ result: await func(...args) }] } };
  assert.equal((await capture.probeTabVideo(7)).duration, 3);
  const frames = await capture.captureTabFrames(7, [0, 1], .8, 720);
  assert.deepEqual(frames.map(f => f.timestamp), [0]);
  assert.equal(drawn, 1);
  assert.equal(position, 0);
});

test("Shorts metadata rejects descriptions and captions belonging to a previous video", async t => {
  const old = new Map(["document", "location", "window", "chrome"].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  t.after(() => { for (const [k, d] of old) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });
  let id = "previous";
  const player = { getPlayerResponse: () => ({ videoDetails: { videoId: id, shortDescription: "150 g chocolate" } }) };
  globalThis.document = { querySelector: selector => selector.includes("is-active") ? { querySelector: () => player } : player };
  globalThis.location = { href: "https://www.youtube.com/shorts/current", hostname: "www.youtube.com" };
  globalThis.window = {};
  globalThis.chrome = { scripting: { executeScript: async ({ func, args }) => [{ result: await func(...args) }] } };
  assert.equal(await capture.fetchRecipeCreatorText(7), "");
  assert.equal(await capture.fetchYouTubeCaptions(7), null);
  id = "current";
  assert.equal(await capture.fetchRecipeCreatorText(7), "150 g chocolate");
});

function mockChrome(tabs, requestPermission = async () => true) {
  let queryIndex = 0;
  globalThis.chrome = {
    tabs: {
      query: async () => [tabs[Math.min(queryIndex++, tabs.length - 1)]],
    },
    permissions: {
      request: requestPermission,
    },
  };
}

test("uses an existing activeTab grant without requesting YouTube access", async () => {
  let requested = false;
  mockChrome([{ id: 7, url: "https://www.youtube.com/watch?v=test" }], async () => {
    requested = true;
    return true;
  });

  await capture.ensureTabCapturePermission();
  assert.equal(requested, false);
});

test("requests optional YouTube access when Chrome hides the active URL", async () => {
  let requestedOrigins;
  mockChrome(
    [{ id: 7 }, { id: 7, url: "https://www.youtube.com/watch?v=test" }],
    async ({ origins }) => {
      requestedOrigins = origins;
      return true;
    },
  );

  await capture.ensureTabCapturePermission();
  assert.deepEqual(requestedOrigins, ["https://*.youtube.com/*"]);
});

test("reports a clear error when YouTube access is declined", async () => {
  mockChrome([{ id: 7 }], async () => false);

  await assert.rejects(
    capture.ensureTabCapturePermission(),
    /needs access to YouTube/,
  );
});

test("returns the active tab ID even when Chrome omits its URL", async () => {
  mockChrome([{ id: 42 }]);
  assert.equal(await capture.getActiveTabId(), 42);
});

test("YouTube capture reads the video heading and falls back to a clean tab title", async () => {
  const originalDocument = globalThis.document;
  const originalLocation = globalThis.location;
  let heading = "(2026) Annual review";
  globalThis.document = {
    title: "(459) A useful video - YouTube",
    querySelectorAll: () => [{ readyState: 4, duration: 90, videoWidth: 1280, videoHeight: 720 }],
    querySelector: () => heading ? { textContent: heading } : null,
  };
  globalThis.location = { href: "https://www.youtube.com/watch?v=test", hostname: "www.youtube.com" };
  globalThis.chrome = { scripting: { executeScript: async ({ func }) => [{ result: await func() }] } };
  try {
    assert.equal((await capture.probeTabVideo(7)).title, "(2026) Annual review");
    heading = "";
    assert.equal((await capture.probeTabVideo(7)).title, "A useful video");
    globalThis.location.hostname = "example.com";
    assert.equal((await capture.probeTabVideo(7)).title, "(459) A useful video - YouTube");
  } finally {
    globalThis.document = originalDocument;
    globalThis.location = originalLocation;
  }
});
