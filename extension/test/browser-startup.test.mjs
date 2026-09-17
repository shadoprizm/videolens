import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { build } from "esbuild";
import { indexedDB } from "fake-indexeddb";
import { parseHTML } from "linkedom";

const sidePanelBundle = await build({
  entryPoints: ["src/sidepanel/main.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const sidePanelSource = sidePanelBundle.outputFiles[0].text;

const backgroundBundle = await build({
  entryPoints: ["src/background.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const backgroundSource = backgroundBundle.outputFiles[0].text;

const firefoxBackgroundBundle = await build({
  entryPoints: ["src/background.firefox.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const firefoxBackgroundSource = firefoxBackgroundBundle.outputFiles[0].text;

test("the actual side-panel bundle renders first-run privacy UI", async () => {
  const restore = installBrowserEnvironment({});
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("first-run startup must not use the network");
  };

  try {
    await importBundle(sidePanelSource, "first-run");
    await waitFor(() => document.querySelector("#privacy-title"));
    assert.match(document.querySelector("#view-root").textContent, /Your video stays under your control/);
    assert.equal(document.querySelector(".privacy-details").hasAttribute("open"), false);
    assert.equal(document.querySelectorAll(".privacy-details .privacy-list li").length, 4);
    assert.ok(document.querySelector("#accept-privacy"));
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("the actual side-panel bundle renders every new interface locale", async () => {
  const locales = [
    ["es-MX", "Tu video permanece bajo tu control"],
    ["ro-RO", "Videoclipul tău rămâne sub controlul tău"],
    ["hi-IN", "आपका वीडियो आपके नियंत्रण में रहता है"],
  ];
  for (const [language, expected] of locales) {
    const restore = installBrowserEnvironment({}, false, language);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("first-run startup must not use the network"); };
    try {
      await importBundle(sidePanelSource, `first-run-${language}`);
      await waitFor(() => document.querySelector("#privacy-title"));
      assert.match(document.querySelector("#view-root").textContent, new RegExp(expected));
      assert.equal(document.documentElement.lang, language === "es-MX" ? "es-419" : language.split("-")[0]);
    } finally {
      globalThis.fetch = originalFetch;
      restore();
    }
  }
});

test("the new-user home asks only for a source before report setup", async () => {
  const restore = installBrowserEnvironment({ privacyDisclosureVersion: 3 });
  try {
    await importBundle(sidePanelSource, "progressive-home");
    await waitFor(() => document.querySelector(".source-start"));

    assert.ok(document.querySelector(".product-intro"));
    assert.equal(document.querySelectorAll(".source-choice").length, 2);
    assert.ok(document.querySelector("#btn-library"));
    assert.equal(document.querySelector(".report-library"), null);
    assert.equal(document.querySelector(".provider-seg"), null);
    assert.equal(document.querySelector("#view-root select"), null);
    assert.equal(document.querySelector("#view-root textarea"), null);
    assert.equal(document.querySelector("#view-root input[type=range]"), null);
    assert.equal(document.querySelector(".cost"), null);

    document.querySelector("#choose-page-video").click();
    await waitFor(() => document.querySelector(".report-choice"));
    assert.equal(restore.permissionRequests(), 0);
    assert.match(document.querySelector(".report-choice").textContent, /Detailed report/);
    assert.equal(document.querySelector(".report-mode-select"), null);
    assert.equal(document.querySelector(".advanced-options").hasAttribute("open"), false);

    document.querySelector("#change-report-type").click();
    await waitFor(() => document.querySelector(".report-mode-select"));
    assert.equal(document.querySelectorAll(".report-mode-select option").length, 11);

    document.querySelector(".create-report").click();
    await waitFor(() => document.querySelector(".managed-access"));
    assert.equal(restore.permissionRequests(), 0, "unconfigured access should be resolved before capture permission");
    assert.ok(document.querySelector(".managed-access + .private-access"));
  } finally {
    restore();
  }
});

test("local-file cancellation stays home and a valid file reaches confirmation", async () => {
  const restore = installBrowserEnvironment({ privacyDisclosureVersion: 3 });
  const createElement = document.createElement.bind(document);
  const createObjectUrl = URL.createObjectURL;
  const revokeObjectUrl = URL.revokeObjectURL;
  document.createElement = (tagName, options) => {
    const node = createElement(tagName, options);
    if (String(tagName).toLowerCase() === "video") {
      Object.defineProperty(node, "duration", { configurable: true, value: 125 });
      queueMicrotask(() => node.dispatchEvent(new window.Event("loadedmetadata")));
    }
    return node;
  };
  URL.createObjectURL = () => "blob:local-video-test";
  URL.revokeObjectURL = () => undefined;

  try {
    await importBundle(sidePanelSource, "local-source-flow");
    await waitFor(() => document.querySelector("#choose-local-file"));
    document.querySelector("#choose-local-file").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(document.querySelector(".source-start"), "canceling the picker should preserve home");

    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [{ name: "launch-review.mp4", type: "video/mp4" }],
    });
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    await waitFor(() => document.querySelector(".source-summary"));
    assert.match(document.querySelector(".source-summary").textContent, /launch-review\.mp4/);
    assert.match(document.querySelector(".source-summary").textContent, /2:05/);
    assert.equal(restore.permissionRequests(), 0);
  } finally {
    URL.createObjectURL = createObjectUrl;
    URL.revokeObjectURL = revokeObjectUrl;
    restore();
  }
});

test("returning users get a compact home and configured access starts from the final click", async () => {
  const restore = installBrowserEnvironment({
    privacyDisclosureVersion: 3,
    hasCompletedFirstReport: true,
    analysisProvider: "byok",
    openaiApiKey: "sk-test",
  }, false, "en-US", false, "", true, true);
  try {
    await importBundle(sidePanelSource, "returning-home");
    await waitFor(() => document.querySelector(".compact-home"));
    assert.equal(document.querySelector(".product-intro"), null);
    assert.match(document.querySelector(".compact-home").textContent, /New report/);

    document.querySelector("#choose-page-video").click();
    await waitFor(() => document.querySelector(".create-report"));
    assert.match(document.querySelector("#entitlement-badge").textContent, /PRIVATE/);
    document.querySelector(".create-report").click();
    await waitFor(() => restore.permissionRequests() === 1);
  } finally {
    restore();
  }
});

test("configured Managed access is reused and disclosed on report setup", async () => {
  const restore = installBrowserEnvironment({
    privacyDisclosureVersion: 3,
    hasCompletedFirstReport: true,
    analysisProvider: "pro",
    proToken: "managed-token",
    proEmail: "viewer@example.com",
  });
  const originalFetch = globalThis.fetch;
  let entitlementRequests = 0;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/api/entitlement")) {
      entitlementRequests += 1;
      return jsonResponse({ entitlement: managedEntitlement() });
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  };

  try {
    await importBundle(sidePanelSource, "configured-managed-access");
    await waitFor(() => entitlementRequests === 1);
    await waitFor(() => document.querySelector("#entitlement-badge").textContent === "PRO");
    document.querySelector("#choose-page-video").click();
    await waitFor(() => document.querySelector(".setup-cost"));
    assert.match(document.querySelector(".setup-cost").textContent, /Included in your managed-report allowance/);
    assert.equal(restore.permissionRequests(), 0);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("an unavailable preferred access method is not silently switched", async () => {
  const restore = installBrowserEnvironment({
    privacyDisclosureVersion: 3,
    hasCompletedFirstReport: true,
    analysisProvider: "pro",
    proToken: "expired-token",
    proEmail: "viewer@example.com",
    openaiApiKey: "sk-ready",
  });
  const originalFetch = globalThis.fetch;
  let entitlementRequests = 0;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/api/entitlement")) {
      entitlementRequests += 1;
      return jsonResponse({ entitlement: managedEntitlement({
        subscriptionStatus: "expired",
        managedReportsUsed: 1,
        managedReportsRemaining: 0,
        canUseManagedAi: false,
      }) });
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  };

  try {
    await importBundle(sidePanelSource, "unavailable-managed-access");
    await waitFor(() => entitlementRequests === 1);
    await waitFor(() => document.querySelector("#entitlement-badge").textContent === "");
    document.querySelector("#choose-page-video").click();
    document.querySelector(".create-report").click();
    await waitFor(() => document.querySelector(".managed-access"));

    assert.equal(restore.localState.analysisProvider, "pro");
    assert.match(document.querySelector("#managed-access-action").textContent, /Account & billing/);
    assert.match(document.querySelector(".private-access button").textContent, /Continue privately/);
    assert.equal(restore.permissionRequests(), 0);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("a rejected private key stays on the focused access screen", async () => {
  const restore = installBrowserEnvironment({ privacyDisclosureVersion: 3 });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes("api.openai.com/v1/models")) return new Response("Unauthorized", { status: 401 });
    throw new Error(`Unexpected request: ${String(input)}`);
  };

  try {
    await importBundle(sidePanelSource, "rejected-access-key");
    await waitFor(() => document.querySelector("#choose-page-video"));
    document.querySelector("#choose-page-video").click();
    document.querySelector(".create-report").click();
    await waitFor(() => document.querySelector("#access-api-key"));
    document.querySelector("#access-api-key").value = "sk-rejected";
    document.querySelector(".private-access form").dispatchEvent(new window.Event("submit", {
      bubbles: true,
      cancelable: true,
    }));

    await waitFor(() => document.querySelector(".banner.error"));
    assert.match(document.querySelector(".banner.error").textContent, /rejected by OpenAI/);
    assert.ok(document.querySelector(".managed-access"));
    assert.equal(restore.localState.openaiApiKey, undefined);
    assert.equal(restore.permissionRequests(), 0);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("the library is a dedicated header destination with an explicit empty state", async () => {
  const restore = installBrowserEnvironment({ privacyDisclosureVersion: 3, hasCompletedFirstReport: true });
  try {
    await importBundle(sidePanelSource, "library-destination");
    await waitFor(() => document.querySelector(".compact-home"));
    document.querySelector("#btn-library").click();
    await waitFor(() => document.querySelector(".report-library"));
    await waitFor(() => document.querySelector(".library-empty-state"));
    assert.equal(document.querySelector(".source-start"), null);
    assert.match(document.querySelector(".library-empty-state").textContent, /No saved reports yet/);
  } finally {
    restore();
  }
});

test("report results split dense prose and separate findings from evidence", async () => {
  const restore = installBrowserEnvironment({}, false, "en-US", false, "?preview=results", false);
  try {
    await importBundle(sidePanelSource, "report-readability");
    await waitFor(() => document.querySelector(".summary-prose"));

    assert.ok(document.querySelector("#view-root").classList.contains("results-view"));
    assert.ok(document.querySelectorAll(".summary-prose > p").length >= 2, "long summaries should become readable paragraphs");
    assert.equal(document.querySelectorAll(".finding-head").length, 3);
    assert.deepEqual(
      [...document.querySelectorAll(".finding-index")].map((node) => node.textContent),
      ["1", "2", "3"],
    );
    assert.ok(document.querySelectorAll(".evidence .evidence-text").length >= 4);
  } finally {
    restore();
  }
});

test("the standalone report preview renders without document.write", async () => {
  const restore = installBrowserEnvironment({}, false, "en-US", false, "?preview=report", false);
  try {
    await importBundle(sidePanelSource, "standalone-report-preview");
    await waitFor(() => document.querySelector(".page-shell"));
    assert.match(document.title, /VideoLens Report/);
    assert.match(document.body.textContent, /Building products people actually use/);
  } finally {
    restore();
  }
});

test("startup failures stay visible and localized in every new interface locale", async () => {
  const originalConsoleError = console.error;
  console.error = () => undefined;
  const locales = [
    ["es-MX", "VideoLens no pudo terminar de cargar"],
    ["ro-RO", "VideoLens nu a putut finaliza încărcarea"],
    ["hi-IN", "VideoLens पूरी तरह लोड नहीं हो सका"],
  ];
  try {
    for (const [language, expected] of locales) {
      const restore = installBrowserEnvironment({}, false, language, true);
      try {
        await importBundle(sidePanelSource, `startup-error-${language}`);
        await waitFor(() => document.querySelector(".startup-state"));
        assert.match(document.querySelector("#view-root").textContent, new RegExp(expected));
      } finally {
        restore();
      }
    }
  } finally {
    console.error = originalConsoleError;
  }
});

test("the actual side-panel bundle renders before pending Pro recovery finishes", async () => {
  const restore = installBrowserEnvironment({
    privacyDisclosureVersion: 3,
    proPairingNonce: "pending-pairing",
    proDeviceId: "device-1",
  }, true);
  const originalFetch = globalThis.fetch;
  let finishRequest;
  globalThis.fetch = async (_url, init) => new Promise((resolve, reject) => {
    finishRequest = resolve;
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });

  try {
    await importBundle(sidePanelSource, "pending-pro");
    await waitFor(() => document.querySelector(".product-intro"));
    assert.match(document.querySelector("#view-root").textContent, /Turn the video into something useful/);
    await waitFor(() => typeof finishRequest === "function");
    finishRequest(new Response(JSON.stringify({ message: "still pending" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(document.querySelector(".product-intro"), "the UI should remain rendered after recovery settles");
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("the service worker registers lifecycle listeners and configures the toolbar", async () => {
  const originalChrome = globalThis.chrome;
  const listeners = {};
  const calls = [];
  globalThis.chrome = {
    runtime: {
      onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
      onStartup: { addListener: (listener) => { listeners.startup = listener; } },
    },
    sidePanel: {
      setPanelBehavior: async (behavior) => { calls.push(behavior); },
    },
  };

  try {
    await importBundle(backgroundSource, "service-worker");
    assert.deepEqual(calls, [{ openPanelOnActionClick: true }]);
    assert.equal(typeof listeners.installed, "function");
    assert.equal(typeof listeners.startup, "function");
    listeners.installed();
    listeners.startup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls.length, 3);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("the Firefox background script opens the sidebar from the toolbar action", async () => {
  const originalChrome = globalThis.chrome;
  const listeners = {};
  let sidebarOpenCalls = 0;
  globalThis.chrome = {
    runtime: {
      onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
      onStartup: { addListener: (listener) => { listeners.startup = listener; } },
    },
    action: {
      onClicked: { addListener: (listener) => { listeners.action = listener; } },
    },
    sidebarAction: {
      open: async () => { sidebarOpenCalls += 1; },
    },
  };

  try {
    await importBundle(firefoxBackgroundSource, "firefox-background");
    assert.equal(typeof listeners.action, "function");
    listeners.action();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(sidebarOpenCalls, 1);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("recipe preview runs through the sidebar and preserves the draft when optional lookup fails", async () => {
  const restore = installBrowserEnvironment({ privacyDisclosureVersion: 3, openaiApiKey: "test-key" });
  const originalFetch = globalThis.fetch;
  const fixture = JSON.parse(readFileSync("test/fixtures/recipe.json", "utf8"));
  let capturedTimes = [], searches = 0;
  globalThis.chrome.scripting.executeScript = async ({ args, world }) => {
    if (Array.isArray(args?.[0])) {
      capturedTimes = args[0];
      return [{ result: { frames: capturedTimes.map(timestamp => ({ timestamp, dataUrl: "data:image/jpeg;base64,AA==" })) } }];
    }
    if (world === "MAIN") return [{ result: args?.length ? { language: "en", segments: [{ start: 0, end: 3, text: "Two eggs and flour" }] } : "Contains flour" }];
    return [{ result: { duration: 3, title: "Recipe test", pageUrl: fixture.source.url, isYouTube: true, width: 720, height: 1280 } }];
  };
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/responses")) { searches++; return jsonResponse({ error: "offline" }, 503); }
    const body = JSON.parse(init.body);
    const content = body.messages[1].content;
    const data = Array.isArray(content) ? { frames: content.filter(p => p.type === "text" && p.text.startsWith("Frame at")).map(p => ({ timestamp: Number(p.text.split(" ")[2]), visual_summary: "Eggs and flour are mixed.", extracted_text: ["2 eggs"], confidence: "high" })) } : fixture;
    return jsonResponse({ choices: [{ message: { content: JSON.stringify(data) } }] });
  };
  try {
    await importBundle(sidePanelSource, "recipe-preview");
    await waitFor(() => document.querySelector("#choose-page-video"));
    document.querySelector("#choose-page-video").click();
    document.querySelector("#change-report-type").click();
    const select = document.querySelector(".report-mode-select");
    const option = select.querySelector('[value="recipe"]');
    assert.ok(option);
    Object.defineProperty(select, "value", { configurable: true, value: "recipe" });
    select.dispatchEvent(new window.Event("change"));
    assert.ok(document.querySelector("#recipe-lookup"));
    assert.equal(document.querySelector("#recipe-lookup").hasAttribute("checked"), false);
    assert.equal(document.querySelector("input[type=range]"), null);
    const lookup = document.querySelector("#recipe-lookup");
    lookup.checked = true; lookup.dispatchEvent(new window.Event("change"));
    document.querySelector(".create-report").click();
    await waitFor(() => document.querySelector(".recipe-card"), 2000);
    assert.deepEqual(capturedTimes, [0, 0.5, 1, 1.5, 2, 2.5]);
    assert.equal(searches, 1);
    assert.match(document.querySelector(".recipe-card").textContent, /Flour quantity is missing/);
    assert.match(document.querySelector(".recipe-research-status").textContent, /unavailable/);
    assert.ok(document.querySelector(".full-report"));
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test("procedure runs through the actual sidebar bundle with caption-guided capture and a checklist", async () => {
  const restore = installBrowserEnvironment({ privacyDisclosureVersion: 3, openaiApiKey: "test-key" });
  const originalFetch = globalThis.fetch;
  const fixture = JSON.parse(readFileSync("test/fixtures/procedure.json", "utf8"));
  let capturedTimes = [], searches = 0;
  globalThis.chrome.scripting.executeScript = async ({ args, world }) => {
    if (Array.isArray(args?.[0])) {
      capturedTimes = args[0];
      return [{ result: { frames: capturedTimes.map(timestamp => ({ timestamp, dataUrl: "data:image/jpeg;base64,AA==" })) } }];
    }
    if (world === "MAIN") return [{ result: args?.length ? { language: "en", segments: [{ start: 0, end: 3, text: "Select cells B2:B10" }] } : "Contains flour" }];
    return [{ result: { duration: 30, title: "Procedure test", pageUrl: fixture.source.url, isYouTube: true, width: 720, height: 1280 } }];
  };
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/responses")) { searches++; return jsonResponse({ error: "offline" }, 503); }
    const body = JSON.parse(init.body);
    const content = body.messages[1].content;
    const data = Array.isArray(content) ? { frames: content.filter(p => p.type === "text" && p.text.startsWith("Frame at")).map(p => ({ timestamp: Number(p.text.split(" ")[2]), visual_summary: "Data validation settings.", extracted_text: ["B2:B10", "Todo", "Done"], confidence: "high" })) } : fixture;
    return jsonResponse({ choices: [{ message: { content: JSON.stringify(data) } }] });
  };
  try {
    await importBundle(sidePanelSource, "procedure-sidebar");
    await waitFor(() => document.querySelector("#choose-page-video"));
    document.querySelector("#choose-page-video").click();
    document.querySelector("#change-report-type").click();
    const select = document.querySelector(".report-mode-select");
    const option = select.querySelector('[value="tutorial"]');
    assert.ok(option);
    Object.defineProperty(select, "value", { configurable: true, value: "tutorial" });
    select.dispatchEvent(new window.Event("change"));
    assert.equal(document.querySelector("input[type=range]"), null);
    document.querySelector(".create-report").click();
    await waitFor(() => document.querySelector(".procedure-card"), 2000);
    assert.ok(capturedTimes.length > 40);
    assert.ok(capturedTimes.includes(0));
    assert.equal(searches, 0);
    assert.equal(document.querySelectorAll('.procedure-checklist input[type="checkbox"]').length, 2);
    assert.match(document.querySelector(".procedure-card").textContent, /Sharing permission is not shown/);
    assert.ok(document.querySelector(".full-report"));
  } finally { globalThis.fetch = originalFetch; restore(); }
});

function installBrowserEnvironment(
  localState,
  containsPermission = false,
  uiLanguage = "en-US",
  storageFailure = false,
  locationSearch = "",
  useChrome = true,
  hideTabUrlUntilPermission = false,
) {
  const html = readFileSync("public/sidepanel.html", "utf8");
  const { window } = parseHTML(html);
  const state = { ...localState };
  let permissionRequests = 0;
  const replacements = {
    window,
    document: window.document,
    location: { search: locationSearch },
    navigator: {
      language: uiLanguage,
      storage: {
        estimate: async () => ({ usage: 0, quota: 1_000_000 }),
        persisted: async () => true,
        persist: async () => true,
      },
    },
    indexedDB,
    chrome: useChrome ? {
      i18n: { getUILanguage: () => uiLanguage },
      storage: {
        local: {
          get: async () => {
            if (storageFailure) throw new Error("simulated Chrome storage failure");
            return { ...state };
          },
          set: async (values) => { Object.assign(state, values); },
          remove: async (keys) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key];
          },
        },
      },
      permissions: {
        contains: async () => containsPermission,
        request: async () => {
          permissionRequests += 1;
          return true;
        },
      },
      tabs: {
        create: async () => undefined,
        query: async () => [{
          id: 1,
          url: hideTabUrlUntilPermission && permissionRequests === 0
            ? undefined
            : "https://www.youtube.com/watch?v=test",
        }],
      },
      scripting: { executeScript: async () => [] },
    } : undefined,
  };
  const descriptors = new Map();
  for (const [name, value] of Object.entries(replacements)) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  window.confirm = () => true;
  window.open = () => null;

  const restore = () => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
  restore.localState = state;
  restore.permissionRequests = () => permissionRequests;
  return restore;
}

async function importBundle(source, name) {
  const encoded = Buffer.from(`${source}\n//# sourceURL=${name}.js`).toString("base64");
  return import(`data:text/javascript;base64,${encoded}#${name}-${Date.now()}`);
}

function managedEntitlement(overrides = {}) {
  return {
    plan: "free",
    subscriptionStatus: "active",
    managedReportsUsed: 0,
    managedReportsLimit: 1,
    managedReportsRemaining: 1,
    periodEndsAt: null,
    cancelAtPeriodEnd: false,
    canUseManagedAi: true,
    ...overrides,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function waitFor(predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for the browser UI.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
