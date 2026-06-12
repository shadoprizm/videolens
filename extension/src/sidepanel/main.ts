import { analyzeTimeline, askQuestion, estimateCost, fmtTs } from "../lib/analyze";
import {
  captureTabFrames,
  fetchYouTubeCaptions,
  getActiveTabId,
  makeTabSource,
  planFrameTimestamps,
  probeTabVideo,
} from "../lib/capture";
import { DEFAULTS, LEMON, LINKS, TRIAL_ANALYSES } from "../lib/config";
import { describeFrames } from "../lib/describeFrames";
import { activateLicense, deactivateLicense, getEntitlement, type Entitlement } from "../lib/license";
import {
  captureLocalFrames,
  closeLocalVideo,
  makeLocalSource,
  openLocalVideo,
  transcribeLocalFile,
  type LocalVideo,
} from "../lib/localFile";
import { verifyApiKey } from "../lib/openai";
import { download, toMarkdown } from "../lib/report";
import {
  getApiKey,
  getLicense,
  getMaxFrames,
  getTrialUsed,
  incrementTrialUsed,
  setApiKey,
  setMaxFrames,
} from "../lib/storage";
import { buildTimeline } from "../lib/timeline";
import { MODE_ORDER, MODE_PROMPTS } from "../lib/modes";
import type { Analysis, AnalysisMode, CapturedFrame, QaEntry, Transcript } from "../lib/types";

type SourceKind = "tab" | "file";

interface State {
  view: "main" | "settings" | "progress" | "results";
  sourceKind: SourceKind;
  mode: AnalysisMode;
  prompt: string;
  maxFrames: number;
  localVideo: LocalVideo | null;
  entitlement: Entitlement;
  analysis: Analysis | null;
  qa: QaEntry[];
  error: string | null;
}

const state: State = {
  view: "main",
  sourceKind: "tab",
  mode: "general",
  prompt: "",
  maxFrames: DEFAULTS.maxFrames,
  localVideo: null,
  entitlement: { kind: "trial", remaining: TRIAL_ANALYSES },
  analysis: null,
  qa: [],
  error: null,
};

const root = document.getElementById("view-root")!;
const badge = document.getElementById("entitlement-badge")!;
document.getElementById("btn-settings")!.addEventListener("click", () => {
  state.view = state.view === "settings" ? "main" : "settings";
  render();
});

void (async () => {
  state.maxFrames = await getMaxFrames(DEFAULTS.maxFrames);
  state.entitlement = await getEntitlement();
  render();
})();

// ── rendering ───────────────────────────────────────────────────────────────

function render(): void {
  renderBadge();
  root.replaceChildren();
  if (state.view === "settings") renderSettings();
  else if (state.view === "results" && state.analysis) renderResults();
  else renderMain();
}

function renderBadge(): void {
  if (state.entitlement.kind === "licensed") {
    badge.textContent = "PRO";
    badge.className = "brand-badge pro";
  } else if (state.entitlement.kind === "trial") {
    badge.textContent = `Trial · ${state.entitlement.remaining} left`;
    badge.className = "brand-badge";
  } else {
    badge.textContent = "Trial ended";
    badge.className = "brand-badge";
  }
}

function renderMain(): void {
  if (state.error) {
    root.appendChild(el(`<div class="banner error">${esc(state.error)}</div>`));
  }

  if (state.entitlement.kind === "locked") {
    renderPaywall();
    return;
  }
  if (state.entitlement.kind === "trial") {
    root.appendChild(
      el(
        `<div class="banner trial">Free trial: <b>&nbsp;${state.entitlement.remaining} of ${TRIAL_ANALYSES}&nbsp;</b> analyses left. ` +
          `<a href="${LEMON.checkoutUrl}" target="_blank" style="color:inherit;font-weight:600">Get VideoLens Pro →</a></div>`,
      ),
    );
  }

  // Source picker
  const sourceSection = el(`<div class="section"><span class="label">Source</span></div>`);
  const seg = el(`<div class="seg"></div>`);
  const tabBtn = el(
    `<button class="${state.sourceKind === "tab" ? "active" : ""}">Video on this page</button>`,
  ) as HTMLButtonElement;
  const fileBtn = el(
    `<button class="${state.sourceKind === "file" ? "active" : ""}">Local file</button>`,
  ) as HTMLButtonElement;
  tabBtn.addEventListener("click", () => {
    state.sourceKind = "tab";
    render();
  });
  fileBtn.addEventListener("click", () => {
    state.sourceKind = "file";
    render();
  });
  seg.append(tabBtn, fileBtn);
  sourceSection.appendChild(seg);

  if (state.sourceKind === "tab") {
    sourceSection.appendChild(
      el(
        `<p class="hint">Open the page with the video (YouTube or any HTML5 player), click the VideoLens toolbar icon there, then analyze. DRM-protected sites (Netflix etc.) can't be captured.</p>`,
      ),
    );
  } else {
    const drop = el(
      `<div class="file-drop ${state.localVideo ? "has-file" : ""}" style="margin-top:8px">` +
        (state.localVideo
          ? `<b>${esc(state.localVideo.file.name)}</b><br>${fmtTs(state.localVideo.duration)} · click to change`
          : "Click to choose a video file<br><span style='font-size:11px'>mp4 / webm / mov — processed locally</span>") +
        `</div>`,
    );
    const input = el(`<input type="file" accept="video/*,.mkv" style="display:none">`) as HTMLInputElement;
    drop.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (state.localVideo) closeLocalVideo(state.localVideo);
      state.localVideo = null;
      state.error = null;
      try {
        state.localVideo = await openLocalVideo(file);
      } catch (e) {
        state.error = (e as Error).message;
      }
      render();
    });
    sourceSection.append(drop, input);
  }
  root.appendChild(sourceSection);

  // Mode
  const modeSection = el(`<div class="section"><span class="label">Analysis mode</span></div>`);
  const select = el(`<select></select>`) as HTMLSelectElement;
  for (const m of MODE_ORDER) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = MODE_PROMPTS[m].label;
    opt.selected = m === state.mode;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    state.mode = select.value as AnalysisMode;
    render();
  });
  modeSection.appendChild(select);
  root.appendChild(modeSection);

  // Prompt
  const promptSection = el(`<div class="section"><span class="label">Prompt</span></div>`);
  const textarea = el(
    `<textarea placeholder="${esc(MODE_PROMPTS[state.mode].defaultPrompt)}"></textarea>`,
  ) as HTMLTextAreaElement;
  textarea.value = state.prompt;
  textarea.addEventListener("input", () => (state.prompt = textarea.value));
  promptSection.appendChild(textarea);
  root.appendChild(promptSection);

  // Frames slider + cost
  const framesSection = el(
    `<div class="section"><span class="label">Max frames — <span id="mf-val">${state.maxFrames}</span></span></div>`,
  );
  const slider = el(`<input type="range" min="5" max="80" step="5">`) as HTMLInputElement;
  slider.value = String(state.maxFrames);
  const cost = el(`<div class="cost"></div>`);
  const updateCost = () => {
    const minutes = state.sourceKind === "file" && state.localVideo ? state.localVideo.duration / 60 : 3.0;
    const [low, high] = estimateCost(state.maxFrames, Math.max(0.5, minutes));
    const assumed = state.sourceKind === "file" && state.localVideo ? "your file" : "~3-min video";
    cost.innerHTML = `Estimated OpenAI cost: <b>~$${low.toFixed(2)}–$${high.toFixed(2)}</b> · ${assumed} · billed to your key`;
  };
  slider.addEventListener("input", () => {
    state.maxFrames = Number(slider.value);
    framesSection.querySelector("#mf-val")!.textContent = slider.value;
    updateCost();
    void setMaxFrames(state.maxFrames);
  });
  updateCost();
  framesSection.append(slider);
  root.append(framesSection);

  // Run
  const run = el(`<button class="btn btn-primary">Analyze video</button>`) as HTMLButtonElement;
  run.addEventListener("click", () => void runAnalysis());
  root.append(run, cost);
}

function renderPaywall(): void {
  root.appendChild(
    el(
      `<div class="paywall">
        <h2>Your free trial has ended</h2>
        <div class="price">$29 <small>one-time</small></div>
        <p>Unlimited analyses, forever. You bring your own OpenAI key — no subscription, no markup on usage.</p>
        <a class="btn btn-primary" href="${LEMON.checkoutUrl}" target="_blank" style="text-decoration:none">Buy VideoLens Pro</a>
        <p style="margin-top:14px;margin-bottom:0">Already bought it? <a href="#" id="goto-activate" style="color:var(--brand);font-weight:600">Enter your license key</a></p>
      </div>`,
    ),
  );
  root.querySelector("#goto-activate")!.addEventListener("click", (e) => {
    e.preventDefault();
    state.view = "settings";
    render();
  });
}

interface StepHandle {
  set(index: number, status: "pending" | "active" | "done", labelOverride?: string): void;
}

function renderProgress(steps: string[]): StepHandle {
  root.replaceChildren();
  const list = el(`<ul class="steps"></ul>`);
  const items = steps.map((s) => {
    const li = el(`<li><span class="dot"></span><span class="t">${esc(s)}</span></li>`);
    list.appendChild(li);
    return li;
  });
  root.appendChild(el(`<div class="card"><h3>Analyzing</h3></div>`)).appendChild(list);
  return {
    set(index, status, labelOverride) {
      const li = items[index];
      if (!li) return;
      li.className = status === "pending" ? "" : status;
      if (labelOverride) li.querySelector(".t")!.textContent = labelOverride;
    },
  };
}

function renderResults(): void {
  const a = state.analysis!;

  const back = el(`<button class="back-link">← New analysis</button>`);
  back.addEventListener("click", () => {
    state.view = "main";
    state.error = null;
    render();
  });
  root.appendChild(back);

  root.appendChild(
    el(
      `<div class="meta-line"><b>${esc(a.source.title ?? "Untitled video")}</b><br>` +
        `${MODE_PROMPTS[a.mode].label} · ${a.source.durationSeconds ? fmtTs(a.source.durationSeconds) : "?"} · ` +
        `overall confidence <span class="conf ${a.confidence}">${a.confidence}</span></div>`,
    ),
  );

  const exportRow = el(`<div class="export-row"></div>`);
  const mdBtn = el(`<button class="btn btn-secondary btn-sm">Download .md</button>`);
  const jsonBtn = el(`<button class="btn btn-secondary btn-sm">Download .json</button>`);
  const copyBtn = el(`<button class="btn btn-secondary btn-sm">Copy report</button>`);
  mdBtn.addEventListener("click", () => download("videolens-report.md", toMarkdown(a, state.qa), "text/markdown"));
  jsonBtn.addEventListener("click", () =>
    download("videolens-report.json", JSON.stringify({ ...a, qa: state.qa }, null, 2), "application/json"),
  );
  copyBtn.addEventListener("click", () => void navigator.clipboard.writeText(toMarkdown(a, state.qa)));
  exportRow.append(mdBtn, jsonBtn, copyBtn);
  root.appendChild(exportRow);

  const summary = el(`<div class="card"><h3>Summary</h3><p>${esc(a.summary) || "<i>(none)</i>"}</p></div>`);
  root.appendChild(summary);

  if (a.findings.length > 0) {
    const card = el(`<div class="card"><h3>Findings</h3></div>`);
    for (const f of a.findings) {
      const div = el(
        `<div class="finding"><div class="f-text">${esc(f.finding)}<span class="conf ${f.confidence}">${f.confidence}</span></div></div>`,
      );
      for (const e of f.evidence) {
        div.appendChild(el(`<div class="evidence"><span class="ts">${fmtTs(e.timestamp)}</span>${esc(e.detail)}</div>`));
      }
      card.appendChild(div);
    }
    root.appendChild(card);
  }

  if (a.recommendations.length > 0) {
    const card = el(`<div class="card"><h3>Recommendations</h3><ol class="recs"></ol></div>`);
    const ol = card.querySelector("ol")!;
    for (const r of a.recommendations) {
      ol.appendChild(
        el(
          `<li>${esc(r.recommendation)}<span class="conf ${r.confidence}">${r.confidence}</span>` +
            (r.rationale ? `<div class="rationale">${esc(r.rationale)}</div>` : "") +
            `</li>`,
        ),
      );
    }
    root.appendChild(card);
  }

  if (a.tasks.length > 0) {
    const card = el(`<div class="card"><h3>Tasks</h3><ul class="tasks"></ul></div>`);
    const ul = card.querySelector("ul")!;
    for (const t of a.tasks) {
      ul.appendChild(el(`<li>${esc(t.title)}${t.detail ? `<div class="rationale">${esc(t.detail)}</div>` : ""}</li>`));
    }
    root.appendChild(card);
  }

  if (a.limitations.length > 0) {
    const card = el(`<div class="card"><h3>Limitations</h3><ul class="limits"></ul></div>`);
    const ul = card.querySelector("ul")!;
    for (const lim of a.limitations) ul.appendChild(el(`<li>${esc(lim)}</li>`));
    root.appendChild(card);
  }

  // Q&A
  const qaCard = el(`<div class="card"><h3>Ask a follow-up</h3></div>`);
  const history = el(`<div></div>`);
  for (const entry of state.qa) {
    history.appendChild(el(`<div class="qa-q">Q: ${esc(entry.question)}</div>`));
    history.appendChild(el(`<div class="qa-answer">${mdLite(entry.answer)}</div>`));
  }
  const qaRow = el(`<div class="row" style="margin-top:8px"></div>`);
  const qaInput = el(`<input type="text" class="grow" placeholder="e.g. What error appears at 1:24?">`) as HTMLInputElement;
  const qaBtn = el(`<button class="btn btn-secondary btn-sm">Ask</button>`) as HTMLButtonElement;
  const ask = async () => {
    const q = qaInput.value.trim();
    if (!q) return;
    const apiKey = await getApiKey();
    if (!apiKey) {
      state.error = "Add your OpenAI API key in Settings first.";
      state.view = "settings";
      render();
      return;
    }
    qaBtn.disabled = true;
    qaBtn.textContent = "…";
    try {
      const answer = await askQuestion(apiKey, q, a.timeline, a);
      state.qa.push({ question: q, answer });
      render();
    } catch (e) {
      state.error = (e as Error).message;
      qaBtn.disabled = false;
      qaBtn.textContent = "Ask";
    }
  };
  qaBtn.addEventListener("click", () => void ask());
  qaInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void ask();
  });
  qaRow.append(qaInput, qaBtn);
  qaCard.append(history, qaRow);
  root.appendChild(qaCard);

  if (state.error) root.prepend(el(`<div class="banner error">${esc(state.error)}</div>`));
  state.error = null;
}

function renderSettings(): void {
  const back = el(`<button class="back-link">← Back</button>`);
  back.addEventListener("click", () => {
    state.view = state.analysis ? "results" : "main";
    render();
  });
  root.appendChild(back);

  // OpenAI key
  const keyCard = el(
    `<div class="card"><h3>OpenAI API key</h3>
      <div class="row"><input type="password" class="grow" id="api-key" placeholder="sk-...">
      <button class="btn btn-secondary btn-sm" id="save-key">Save</button></div>
      <p class="hint">Stored only on this device (<code>chrome.storage.local</code>), sent only to api.openai.com. Analysis costs are billed to your OpenAI account. <a href="${LINKS.openaiKeys}" target="_blank">Get a key →</a></p>
      <div id="key-status"></div></div>`,
  );
  root.appendChild(keyCard);
  const keyInput = keyCard.querySelector<HTMLInputElement>("#api-key")!;
  const keyStatus = keyCard.querySelector<HTMLElement>("#key-status")!;
  void getApiKey().then((k) => {
    if (k) {
      keyInput.value = k;
      keyStatus.innerHTML = `<div class="banner ok" style="margin:8px 0 0">Key saved.</div>`;
    }
  });
  keyCard.querySelector("#save-key")!.addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (!key) {
      await setApiKey(null);
      keyStatus.innerHTML = `<div class="banner trial" style="margin:8px 0 0">Key removed.</div>`;
      return;
    }
    keyStatus.innerHTML = `<div class="banner trial" style="margin:8px 0 0">Checking key…</div>`;
    const ok = await verifyApiKey(key).catch(() => false);
    if (!ok) {
      keyStatus.innerHTML = `<div class="banner error" style="margin:8px 0 0">That key was rejected by OpenAI. Double-check and try again.</div>`;
      return;
    }
    await setApiKey(key);
    keyStatus.innerHTML = `<div class="banner ok" style="margin:8px 0 0">Key verified and saved.</div>`;
  });

  // License
  const licCard = el(`<div class="card"><h3>License</h3><div id="lic-body"></div></div>`);
  root.appendChild(licCard);
  const licBody = licCard.querySelector<HTMLElement>("#lic-body")!;

  void (async () => {
    const license = await getLicense();
    const used = await getTrialUsed();
    if (license?.valid) {
      licBody.appendChild(el(`<div class="banner ok">VideoLens Pro is active. Key: <code>…${esc(license.licenseKey.slice(-8))}</code></div>`));
      const deact = el(`<button class="btn btn-secondary btn-sm">Deactivate on this device</button>`);
      deact.addEventListener("click", async () => {
        await deactivateLicense();
        state.entitlement = await getEntitlement();
        render();
      });
      licBody.appendChild(deact);
    } else {
      licBody.appendChild(
        el(
          `<p class="hint" style="margin:0 0 8px">Trial: ${Math.min(used, TRIAL_ANALYSES)} of ${TRIAL_ANALYSES} free analyses used. ` +
            `<a href="${LEMON.checkoutUrl}" target="_blank">Buy VideoLens Pro ($29 one-time) →</a> Your license key arrives by email.</p>`,
        ),
      );
      const row = el(`<div class="row"></div>`);
      const licInput = el(`<input type="text" class="grow" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX">`) as HTMLInputElement;
      const actBtn = el(`<button class="btn btn-secondary btn-sm">Activate</button>`) as HTMLButtonElement;
      const status = el(`<div></div>`);
      actBtn.addEventListener("click", async () => {
        actBtn.disabled = true;
        status.innerHTML = `<div class="banner trial" style="margin:8px 0 0">Activating…</div>`;
        try {
          await activateLicense(licInput.value);
          state.entitlement = await getEntitlement();
          state.view = "main";
          render();
        } catch (e) {
          status.innerHTML = `<div class="banner error" style="margin:8px 0 0">${esc((e as Error).message)}</div>`;
          actBtn.disabled = false;
        }
      });
      row.append(licInput, actBtn);
      licBody.append(row, status);
    }
  })();

  root.appendChild(
    el(
      `<p class="hint" style="text-align:center">VideoLens is open source · <a href="${LINKS.github}" target="_blank">GitHub</a> · <a href="${LINKS.privacy}" target="_blank">Privacy</a> · <a href="${LINKS.site}" target="_blank">videolens.io</a></p>`,
    ),
  );
}

// ── pipeline run ────────────────────────────────────────────────────────────

async function runAnalysis(): Promise<void> {
  state.error = null;

  const entitlement = await getEntitlement();
  state.entitlement = entitlement;
  if (entitlement.kind === "locked") {
    state.view = "main";
    render();
    return;
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    state.error = "Add your OpenAI API key first (Settings → OpenAI API key).";
    state.view = "settings";
    render();
    return;
  }

  if (state.sourceKind === "file" && !state.localVideo) {
    state.error = "Choose a video file first.";
    render();
    return;
  }

  const prompt = state.prompt.trim() || MODE_PROMPTS[state.mode].defaultPrompt;

  try {
    state.view = "progress";
    if (state.sourceKind === "tab") {
      await runTabAnalysis(apiKey, prompt);
    } else {
      await runFileAnalysis(apiKey, prompt);
    }
    if (entitlement.kind === "trial") {
      await incrementTrialUsed();
    }
    state.entitlement = await getEntitlement();
    state.qa = [];
    state.view = "results";
  } catch (e) {
    state.error = (e as Error).message;
    state.view = "main";
  }
  render();
}

async function runTabAnalysis(apiKey: string, prompt: string): Promise<void> {
  const steps = renderProgress([
    "Finding video on the page",
    "Fetching captions",
    "Capturing frames",
    "Describing frames",
    "Building timeline",
    "Synthesizing analysis",
  ]);

  steps.set(0, "active");
  const tabId = await getActiveTabId();
  const probe = await probeTabVideo(tabId);
  steps.set(0, "done", `Found video — ${fmtTs(probe.duration)}`);

  steps.set(1, "active");
  let transcript: Transcript | null = null;
  if (probe.isYouTube) {
    transcript = await fetchYouTubeCaptions(tabId);
    steps.set(1, "done", transcript ? `Captions: ${transcript.segments.length} segments` : "No captions — frames only");
  } else {
    steps.set(1, "done", "Captions: n/a for this site");
  }

  steps.set(2, "active");
  const timestamps = planFrameTimestamps(probe.duration, state.maxFrames, DEFAULTS.frameIntervalSeconds);
  const frames = await captureTabFrames(tabId, timestamps, DEFAULTS.frameJpegQuality, DEFAULTS.maxFrameEdgePx);
  steps.set(2, "done", `Captured ${frames.length} frames`);

  const source = makeTabSource(probe, transcript !== null);
  await describeAndSynthesize(apiKey, steps, frames, transcript, probe.duration, source, prompt);
}

async function runFileAnalysis(apiKey: string, prompt: string): Promise<void> {
  const local = state.localVideo!;
  const steps = renderProgress([
    "Sampling frames",
    "Transcribing audio",
    "Describing frames",
    "Building timeline",
    "Synthesizing analysis",
  ]);

  steps.set(0, "active");
  const timestamps = planFrameTimestamps(local.duration, state.maxFrames, DEFAULTS.frameIntervalSeconds);
  const frames = await captureLocalFrames(local, timestamps, (done, total) =>
    steps.set(0, "active", `Sampling frames ${done}/${total}`),
  );
  steps.set(0, "done", `Sampled ${frames.length} frames`);

  steps.set(1, "active");
  const { transcript, limitation } = await transcribeLocalFile(apiKey, local, (done, total) =>
    steps.set(1, "active", `Transcribing audio ${done}/${total}`),
  );
  steps.set(1, "done", transcript ? `Transcribed ${transcript.segments.length} chunks` : "Audio skipped");

  const source = makeLocalSource(local, limitation ? [limitation] : []);
  await describeAndSynthesize(apiKey, steps, frames, transcript, local.duration, source, prompt, 2);
}

async function describeAndSynthesize(
  apiKey: string,
  steps: StepHandle,
  frames: CapturedFrame[],
  transcript: Transcript | null,
  duration: number,
  source: Parameters<typeof analyzeTimeline>[2],
  prompt: string,
  stepOffset = 3,
): Promise<void> {
  steps.set(stepOffset, "active");
  const summaries = await describeFrames(apiKey, frames, (done, total) =>
    steps.set(stepOffset, "active", `Describing frames ${done}/${total}`),
  );
  steps.set(stepOffset, "done", `Described ${summaries.length} frames`);

  steps.set(stepOffset + 1, "active");
  const timeline = buildTimeline(summaries, transcript, duration);
  if (timeline.segments.length === 0) {
    throw new Error("Nothing usable was extracted from this video (no frames, no transcript).");
  }
  steps.set(stepOffset + 1, "done", `Timeline: ${timeline.segments.length} segments`);

  steps.set(stepOffset + 2, "active");
  state.analysis = await analyzeTimeline(apiKey, timeline, source, state.mode, prompt);
  steps.set(stepOffset + 2, "done");
}

// ── helpers ─────────────────────────────────────────────────────────────────

function el(html: string): HTMLElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild as HTMLElement;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Tiny markdown renderer for Q&A answers: paragraphs, bullets, bold, inline
// code, and [MM:SS] timestamp chips. Input is escaped first.
function mdLite(text: string): string {
  const blocks = esc(text).split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*[-•*]\s+/, ""))}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${inline(block.replace(/\n/g, "<br>"))}</p>`;
    })
    .join("");

  function inline(s: string): string {
    return s
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, `<span class="ts">$1</span>`);
  }
}
