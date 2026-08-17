import { analyzeTimeline, askQuestion, estimateCost, fmtTs } from "../lib/analyze";
import {
  captureTabFrames,
  fetchYouTubeCaptions,
  getActiveTabId,
  makeTabSource,
  planFrameTimestamps,
  probeTabVideo,
} from "../lib/capture";
import { DEFAULTS, LINKS } from "../lib/config";
import { describeFrames } from "../lib/describeFrames";
import { DEMO_ANALYSIS, DEMO_QA } from "../lib/demo";
import {
  captureLocalFrames,
  closeLocalVideo,
  makeLocalSource,
  openLocalVideo,
  transcribeLocalFile,
  type LocalVideo,
} from "../lib/localFile";
import { verifyApiKey } from "../lib/openai";
import type { AiAccess } from "../lib/openai";
import {
  completeManagedReport,
  disconnectPro,
  fetchProEntitlement,
  openProAccount,
  reserveManagedReport,
  resumeProConnection,
  startProConnection,
  type ProEntitlement,
} from "../lib/pro";
import {
  download,
  printHtmlReport,
  reportFilename,
  toHtmlReport,
  toMarkdown,
} from "../lib/report";
import {
  acceptPrivacyDisclosure,
  getAnalysisProvider,
  getApiKey,
  getMaxFrames,
  getProCloudSave,
  getProSession,
  hasAcceptedPrivacyDisclosure,
  resetPrivacyDisclosure,
  setAnalysisProvider,
  setApiKey,
  setMaxFrames,
  setProCloudSave,
  type AnalysisProvider,
  type StoredProSession,
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
  analysis: Analysis | null;
  qa: QaEntry[];
  error: string | null;
  privacyDisclosureAccepted: boolean;
  analysisProvider: AnalysisProvider;
  proSession: StoredProSession | null;
  proEntitlement: ProEntitlement | null;
  proCloudSave: boolean;
  managedReportId: string | null;
}

const state: State = {
  view: "main",
  sourceKind: "tab",
  mode: "general",
  prompt: "",
  maxFrames: DEFAULTS.maxFrames,
  localVideo: null,
  analysis: null,
  qa: [],
  error: null,
  privacyDisclosureAccepted: false,
  analysisProvider: "byok",
  proSession: null,
  proEntitlement: null,
  proCloudSave: false,
  managedReportId: null,
};

const PRIMARY_REPORT_MODES: AnalysisMode[] = ["general", "key_insights", "tutorial", "interview"];

const root = document.getElementById("view-root")!;
const badge = document.getElementById("entitlement-badge")!;
const settingsButton = document.getElementById("btn-settings") as HTMLButtonElement;
const hasExtensionStorage = typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
settingsButton.addEventListener("click", () => {
  if (!state.privacyDisclosureAccepted) return;
  state.view = state.view === "settings" ? "main" : "settings";
  render();
});

void (async () => {
  // A localhost-only preview path lets the exact packaged UI and report be
  // visually tested and captured without installing an unpacked extension.
  if (!hasExtensionStorage) {
    const preview = new URLSearchParams(location.search).get("preview");
    if (preview === "report") {
      document.open();
      document.write(toHtmlReport(DEMO_ANALYSIS, DEMO_QA));
      document.close();
      return;
    }
    state.privacyDisclosureAccepted = preview !== "privacy";
    if (preview === "results") {
      state.analysis = DEMO_ANALYSIS;
      state.qa = [...DEMO_QA];
      state.view = "results";
    }
    render();
    return;
  }
  state.privacyDisclosureAccepted = await hasAcceptedPrivacyDisclosure();
  if (!state.privacyDisclosureAccepted) {
    render();
    return;
  }
  state.maxFrames = await getMaxFrames(DEFAULTS.maxFrames);
  state.analysisProvider = await getAnalysisProvider();
  state.proCloudSave = await getProCloudSave();
  state.proSession = await getProSession();
  if (!state.proSession) state.proSession = await resumeProConnection();
  if (state.proSession) {
    state.proEntitlement = await fetchProEntitlement(state.proSession.token).catch(() => null);
  } else if (state.analysisProvider === "pro") {
    state.analysisProvider = "byok";
    await setAnalysisProvider("byok");
  }
  render();
})();

// ── rendering ───────────────────────────────────────────────────────────────

function render(): void {
  settingsButton.disabled = !state.privacyDisclosureAccepted;
  renderBadge();
  root.replaceChildren();
  if (!state.privacyDisclosureAccepted) renderPrivacyDisclosure();
  else if (state.view === "settings") renderSettings();
  else if (state.view === "results" && state.analysis) renderResults();
  else renderMain();
}

function renderPrivacyDisclosure(): void {
  badge.textContent = "Privacy first";
  badge.className = "brand-badge";

  const disclosure = el(
    `<section class="privacy-disclosure" aria-labelledby="privacy-title">
      <div class="privacy-lock" aria-hidden="true">✓</div>
      <h1 id="privacy-title">Before you analyze</h1>
      <p>VideoLens needs your permission to handle the data required for AI video analysis.</p>
      <ul class="privacy-list">
        <li><b>Private / BYOK mode:</b> the selected video's frames, audio or captions, page title, and your prompt go directly from Chrome to OpenAI using your key. VideoLens does not receive them.</li>
        <li><b>Pro / Managed mode:</b> the same analysis content passes through VideoLens to OpenAI so you do not need an API key. Raw frames and audio are not kept.</li>
        <li><b>Cloud reports are optional:</b> a completed report is stored in your VideoLens account only when you turn on cloud saving.</li>
      </ul>
      <div class="privacy-note">Your OpenAI key always stays in Chrome. VideoLens runs no extension analytics and never sells your data. You can use Private mode forever without creating an account.</div>
      <button class="btn btn-primary" id="accept-privacy">I agree to this data use — Continue</button>
      <p class="privacy-links"><a href="${LINKS.privacy}" target="_blank">Read the full privacy policy</a></p>
    </section>`,
  );
  root.appendChild(disclosure);

  disclosure.querySelector("#accept-privacy")!.addEventListener("click", async () => {
    await acceptPrivacyDisclosure();
    state.privacyDisclosureAccepted = true;
    state.maxFrames = await getMaxFrames(DEFAULTS.maxFrames);
    render();
  });
}

function renderBadge(): void {
  if (state.privacyDisclosureAccepted) {
    badge.textContent = state.analysisProvider === "pro" ? "PRO" : "PRIVATE";
    badge.className = `brand-badge ${state.analysisProvider === "pro" ? "pro" : ""}`;
  }
}

function renderMain(): void {
  if (state.error) {
    root.appendChild(el(`<div class="banner error">${esc(state.error)}</div>`));
  }

  root.appendChild(
    el(
      `<div class="product-intro">
        <div class="product-kicker">Video → professional report</div>
        <h1>Turn the video into something useful.</h1>
        <p>Choose a report style, then VideoLens extracts the important ideas and cites the exact moments that support them.</p>
        <button class="sample-link" id="view-sample">See a complete sample report →</button>
      </div>`,
    ),
  );
  root.querySelector("#view-sample")!.addEventListener("click", () => {
    state.analysis = DEMO_ANALYSIS;
    state.qa = [...DEMO_QA];
    state.view = "results";
    state.error = null;
    render();
  });

  const providerSection = el(`<div class="section"><span class="label">Analysis mode</span></div>`);
  const providerPicker = el(`<div class="seg provider-seg"></div>`);
  const privateButton = el(
    `<button class="${state.analysisProvider === "byok" ? "active" : ""}">Private · your key</button>`,
  ) as HTMLButtonElement;
  const proButton = el(
    `<button class="${state.analysisProvider === "pro" ? "active pro-active" : ""}">Pro · managed</button>`,
  ) as HTMLButtonElement;
  privateButton.addEventListener("click", () => void chooseProvider("byok"));
  proButton.addEventListener("click", () => void chooseProvider("pro"));
  providerPicker.append(privateButton, proButton);
  providerSection.appendChild(providerPicker);
  if (state.analysisProvider === "pro") {
    const entitlement = state.proEntitlement;
    providerSection.appendChild(
      el(
        `<div class="provider-note pro-note"><b>${state.proSession ? esc(state.proSession.email) : "Account required"}</b><span>` +
          (entitlement
            ? `${entitlement.managedReportsRemaining} of ${entitlement.managedReportsLimit} managed reports remaining`
            : "Connect your account in Settings to use managed AI") +
          `</span></div>`,
      ),
    );
  } else {
    providerSection.appendChild(
      el(`<p class="hint">Your content goes directly to OpenAI. VideoLens never receives your key, prompt, media, or report.</p>`),
    );
  }
  root.appendChild(providerSection);

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

  // Report style
  const modeSection = el(`<div class="section"><span class="label">Report style</span></div>`);
  const select = el(`<select></select>`) as HTMLSelectElement;
  const primaryGroup = document.createElement("optgroup");
  primaryGroup.label = "Written reports";
  const specialistGroup = document.createElement("optgroup");
  specialistGroup.label = "Specialized analysis";
  for (const mode of MODE_ORDER) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = MODE_PROMPTS[mode].label;
    option.selected = mode === state.mode;
    (PRIMARY_REPORT_MODES.includes(mode) ? primaryGroup : specialistGroup).appendChild(option);
  }
  select.append(primaryGroup, specialistGroup);
  select.addEventListener("change", () => {
    state.mode = select.value as AnalysisMode;
    state.prompt = "";
    render();
  });
  modeSection.append(
    select,
    el(`<p class="hint mode-hint">${esc(MODE_PROMPTS[state.mode].defaultPrompt)}</p>`),
  );
  root.appendChild(modeSection);

  // Prompt
  const promptSection = el(`<div class="section"><span class="label">Focus <span class="optional">optional</span></span></div>`);
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
  const sliderMax = state.analysisProvider === "pro" ? 40 : 80;
  const effectiveMaxFrames = Math.min(state.maxFrames, sliderMax);
  const slider = el(`<input type="range" min="5" max="${sliderMax}" step="5">`) as HTMLInputElement;
  slider.value = String(effectiveMaxFrames);
  framesSection.querySelector("#mf-val")!.textContent = String(effectiveMaxFrames);
  const cost = el(`<div class="cost"></div>`);
  const updateCost = () => {
    const minutes = state.sourceKind === "file" && state.localVideo ? state.localVideo.duration / 60 : 3.0;
    if (state.analysisProvider === "pro") {
      cost.innerHTML = `<b>Included in your managed-report allowance</b> · up to 40 sampled frames`;
    } else {
      const [low, high] = estimateCost(state.maxFrames, Math.max(0.5, minutes));
      const assumed = state.sourceKind === "file" && state.localVideo ? "your file" : "~3-min video";
      cost.innerHTML = `Estimated OpenAI cost: <b>~$${low.toFixed(2)}–$${high.toFixed(2)}</b> · ${assumed} · billed to your key`;
    }
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
  const run = el(`<button class="btn btn-primary">${state.analysisProvider === "pro" ? "Create managed report" : "Analyze privately"}</button>`) as HTMLButtonElement;
  run.addEventListener("click", () => void runAnalysis());
  root.append(run, cost);
}

async function chooseProvider(provider: AnalysisProvider, returnToMain = false): Promise<void> {
  if (provider === "pro" && !state.proSession) {
    state.error = "Connect your VideoLens account to use managed mode.";
    state.view = "settings";
    render();
    return;
  }
  state.analysisProvider = provider;
  await setAnalysisProvider(provider);
  if (provider === "pro" && state.proSession) {
    state.proEntitlement = await fetchProEntitlement(state.proSession.token).catch(() => null);
  }
  if (returnToMain) state.view = state.analysis ? "results" : "main";
  render();
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

  const reportActions = el(`<div class="report-actions"></div>`);
  const printBtn = el(`<button class="btn btn-primary report-primary">Print / Save PDF</button>`);
  const htmlBtn = el(`<button class="btn btn-secondary report-primary">Download HTML</button>`);
  printBtn.addEventListener("click", () => {
    if (!printHtmlReport(a, state.qa)) {
      download(reportFilename(a, "html"), toHtmlReport(a, state.qa), "text/html");
      state.error = "Chrome blocked the print window, so the complete HTML report was downloaded instead.";
      render();
    }
  });
  htmlBtn.addEventListener("click", () =>
    download(reportFilename(a, "html"), toHtmlReport(a, state.qa), "text/html"),
  );
  reportActions.append(printBtn, htmlBtn);
  root.appendChild(reportActions);

  const exportRow = el(`<div class="export-row secondary-exports"></div>`);
  const mdBtn = el(`<button class="btn btn-ghost btn-sm">Markdown</button>`);
  const jsonBtn = el(`<button class="btn btn-ghost btn-sm">JSON</button>`);
  const copyBtn = el(`<button class="btn btn-ghost btn-sm">Copy text</button>`);
  mdBtn.addEventListener("click", () => download(reportFilename(a, "md"), toMarkdown(a, state.qa), "text/markdown"));
  jsonBtn.addEventListener("click", () =>
    download(reportFilename(a, "json"), JSON.stringify({ ...a, qa: state.qa }, null, 2), "application/json"),
  );
  copyBtn.addEventListener("click", () => void navigator.clipboard.writeText(toMarkdown(a, state.qa)));
  exportRow.append(mdBtn, jsonBtn, copyBtn);
  root.appendChild(exportRow);

  const summary = el(`<div class="card summary-card"><h3>Executive summary</h3><p>${esc(a.summary) || "<i>(none)</i>"}</p></div>`);
  root.appendChild(summary);

  if (a.findings.length > 0) {
    const card = el(`<div class="card"><h3>Key findings</h3></div>`);
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
    const card = el(`<div class="card"><h3>Action items</h3><ul class="tasks"></ul></div>`);
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
    let access: AiAccess;
    if (state.managedReportId && state.proSession) {
      access = { kind: "pro", token: state.proSession.token, reportId: state.managedReportId };
    } else {
      const apiKey = await getApiKey();
      if (!apiKey) {
        state.error = "Add your OpenAI API key in Settings first.";
        state.view = "settings";
        render();
        return;
      }
      access = { kind: "byok", apiKey };
    }
    qaBtn.disabled = true;
    qaBtn.textContent = "…";
    try {
      const answer = await askQuestion(access, q, a.timeline, a);
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
  if (state.error) {
    root.appendChild(el(`<div class="banner error">${esc(state.error)}</div>`));
    state.error = null;
  }

  const entitlement = state.proEntitlement;
  const accountCard = state.proSession
    ? el(
        `<div class="card pro-account-card"><div class="account-heading"><div><h3>VideoLens account</h3><b>${esc(state.proSession.email)}</b></div><span class="plan-pill">${entitlement?.plan === "pro" ? "PRO" : "FREE"}</span></div>
          <p class="hint">${entitlement ? `${entitlement.managedReportsRemaining} of ${entitlement.managedReportsLimit} managed reports remaining.` : "Checking managed-report allowance…"}</p>
          <div class="settings-actions"><button class="btn btn-primary btn-sm" id="use-pro">Use managed mode</button><button class="btn btn-secondary btn-sm" id="manage-account">Account &amp; billing</button><button class="btn btn-ghost btn-sm" id="disconnect-pro">Disconnect</button></div>
          <label class="cloud-toggle"><input type="checkbox" id="cloud-save" ${state.proCloudSave ? "checked" : ""}><span><b>Save completed reports to my cloud library</b><small>Off by default. Raw video, frames, and audio are never saved.</small></span></label>
        </div>`,
      )
    : el(
        `<div class="card pro-account-card"><div class="account-heading"><div><h3>VideoLens Pro</h3><b>No API key required</b></div><span class="plan-pill">PRO</span></div>
          <p class="hint">Connect a free account for one managed starter report. Pro includes 20 managed reports per calendar month for $12/month or $99/year.</p>
          <button class="btn btn-primary" id="connect-pro">Connect VideoLens account</button>
          <p class="hint" style="margin-bottom:0">A browser tab opens for secure passwordless sign-in. Your website login and billing credentials are not stored in the extension.</p>
        </div>`,
      );
  root.appendChild(accountCard);

  if (state.proSession) {
    accountCard.querySelector("#use-pro")!.addEventListener("click", () => void chooseProvider("pro", true));
    accountCard.querySelector("#manage-account")!.addEventListener("click", openProAccount);
    accountCard.querySelector("#disconnect-pro")!.addEventListener("click", async () => {
      await disconnectPro();
      state.proSession = null;
      state.proEntitlement = null;
      state.analysisProvider = "byok";
      await setAnalysisProvider("byok");
      render();
    });
    accountCard.querySelector<HTMLInputElement>("#cloud-save")!.addEventListener("change", async (event) => {
      state.proCloudSave = (event.currentTarget as HTMLInputElement).checked;
      await setProCloudSave(state.proCloudSave);
    });
  } else {
    const connectButton = accountCard.querySelector<HTMLButtonElement>("#connect-pro")!;
    connectButton.addEventListener("click", async () => {
      connectButton.disabled = true;
      connectButton.textContent = "Waiting for browser approval…";
      try {
        state.proSession = await startProConnection();
        state.proEntitlement = await fetchProEntitlement(state.proSession.token);
        state.analysisProvider = "pro";
        await setAnalysisProvider("pro");
        state.error = null;
        render();
      } catch (error) {
        state.error = (error as Error).message;
        connectButton.disabled = false;
        connectButton.textContent = "Connect VideoLens account";
        render();
      }
    });
  }

  // OpenAI key
  const keyCard = el(
    `<div class="card"><h3>Private mode · OpenAI API key</h3>
      <div class="row"><input type="password" class="grow" id="api-key" placeholder="sk-...">
      <button class="btn btn-secondary btn-sm" id="save-key">Save</button></div>
      <p class="hint">Stored only on this device (<code>chrome.storage.local</code>), sent only to api.openai.com. VideoLens never receives it. Analysis costs are billed to your OpenAI account. <a href="${LINKS.openaiKeys}" target="_blank">Get a key →</a></p>
      <div id="key-status"></div></div>`,
  );
  root.appendChild(keyCard);
  const keyInput = keyCard.querySelector<HTMLInputElement>("#api-key")!;
  const keyStatus = keyCard.querySelector<HTMLElement>("#key-status")!;
  if (hasExtensionStorage) {
    void getApiKey().then((k) => {
      if (k) {
        keyInput.value = k;
        keyStatus.innerHTML = `<div class="banner ok" style="margin:8px 0 0">Key saved.</div>`;
      }
    });
  }
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

  const privacyCard = el(
    `<div class="card"><h3>Privacy &amp; data use</h3>
      <p class="hint" style="margin:0 0 8px">Review the separate data paths for Private and Pro Managed modes.</p>
      <button class="btn btn-secondary btn-sm" id="review-privacy">Review disclosure</button>
      <a class="btn btn-ghost btn-sm" href="${LINKS.privacy}" target="_blank">Full privacy policy</a>
    </div>`,
  );
  root.appendChild(privacyCard);
  privacyCard.querySelector("#review-privacy")!.addEventListener("click", async () => {
    await resetPrivacyDisclosure();
    state.privacyDisclosureAccepted = false;
    state.view = "main";
    render();
  });

  root.appendChild(
    el(
      `<p class="hint" style="text-align:center">VideoLens is open source · <a href="${LINKS.github}" target="_blank">GitHub</a> · <a href="${LINKS.privacy}" target="_blank">Privacy</a> · <a href="${LINKS.site}" target="_blank">videolens.io</a></p>`,
    ),
  );
}

// ── pipeline run ────────────────────────────────────────────────────────────

async function runAnalysis(): Promise<void> {
  state.error = null;

  if (state.sourceKind === "file" && !state.localVideo) {
    state.error = "Choose a video file first.";
    render();
    return;
  }

  const prompt = state.prompt.trim() || MODE_PROMPTS[state.mode].defaultPrompt;
  let access: AiAccess;
  let managedReportId: string | null = null;

  if (state.analysisProvider === "pro") {
    if (!state.proSession) {
      state.error = "Connect your VideoLens account first.";
      state.view = "settings";
      render();
      return;
    }
    try {
      const reservation = await reserveManagedReport(state.proSession.token, state.proCloudSave);
      managedReportId = reservation.reportId;
      state.managedReportId = managedReportId;
      access = { kind: "pro", token: state.proSession.token, reportId: managedReportId };
    } catch (error) {
      state.error = (error as Error).message;
      state.proEntitlement = await fetchProEntitlement(state.proSession.token).catch(() => state.proEntitlement);
      render();
      return;
    }
  } else {
    const apiKey = await getApiKey();
    if (!apiKey) {
      state.error = "Add your OpenAI API key first (Settings → Private mode API key).";
      state.view = "settings";
      render();
      return;
    }
    state.managedReportId = null;
    access = { kind: "byok", apiKey };
  }

  try {
    state.analysis = null;
    state.view = "progress";
    if (state.sourceKind === "tab") {
      await runTabAnalysis(access, prompt);
    } else {
      await runFileAnalysis(access, prompt);
    }
    state.qa = [];
    state.view = "results";
    if (managedReportId && state.proSession) {
      try {
        await completeManagedReport(
          state.proSession.token,
          managedReportId,
          state.analysis,
          state.proCloudSave,
        );
      } catch (completionError) {
        state.error = `Your report is ready, but VideoLens could not update the cloud library: ${(completionError as Error).message}`;
      }
      state.proEntitlement = await fetchProEntitlement(state.proSession.token).catch(() => state.proEntitlement);
    }
  } catch (e) {
    if (managedReportId && state.proSession) {
      await completeManagedReport(state.proSession.token, managedReportId, state.analysis, false, true).catch(() => undefined);
      state.proEntitlement = await fetchProEntitlement(state.proSession.token).catch(() => state.proEntitlement);
    }
    state.error = (e as Error).message;
    state.view = "main";
  }
  render();
}

async function runTabAnalysis(access: AiAccess, prompt: string): Promise<void> {
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
  const maxFrames = state.analysisProvider === "pro" ? Math.min(state.maxFrames, 40) : state.maxFrames;
  const timestamps = planFrameTimestamps(probe.duration, maxFrames, DEFAULTS.frameIntervalSeconds);
  const frames = await captureTabFrames(tabId, timestamps, DEFAULTS.frameJpegQuality, DEFAULTS.maxFrameEdgePx);
  steps.set(2, "done", `Captured ${frames.length} frames`);

  const source = makeTabSource(probe, transcript !== null);
  await describeAndSynthesize(access, steps, frames, transcript, probe.duration, source, prompt);
}

async function runFileAnalysis(access: AiAccess, prompt: string): Promise<void> {
  const local = state.localVideo!;
  const steps = renderProgress([
    "Sampling frames",
    "Transcribing audio",
    "Describing frames",
    "Building timeline",
    "Synthesizing analysis",
  ]);

  steps.set(0, "active");
  const maxFrames = state.analysisProvider === "pro" ? Math.min(state.maxFrames, 40) : state.maxFrames;
  const timestamps = planFrameTimestamps(local.duration, maxFrames, DEFAULTS.frameIntervalSeconds);
  const frames = await captureLocalFrames(local, timestamps, (done, total) =>
    steps.set(0, "active", `Sampling frames ${done}/${total}`),
  );
  steps.set(0, "done", `Sampled ${frames.length} frames`);

  steps.set(1, "active");
  const { transcript, limitation } = await transcribeLocalFile(access, local, (done, total) =>
    steps.set(1, "active", `Transcribing audio ${done}/${total}`),
  );
  steps.set(1, "done", transcript ? `Transcribed ${transcript.segments.length} chunks` : "Audio skipped");

  const source = makeLocalSource(local, limitation ? [limitation] : []);
  await describeAndSynthesize(access, steps, frames, transcript, local.duration, source, prompt, 2);
}

async function describeAndSynthesize(
  access: AiAccess,
  steps: StepHandle,
  frames: CapturedFrame[],
  transcript: Transcript | null,
  duration: number,
  source: Parameters<typeof analyzeTimeline>[2],
  prompt: string,
  stepOffset = 3,
): Promise<void> {
  steps.set(stepOffset, "active");
  const summaries = await describeFrames(access, frames, (done, total) =>
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
  state.analysis = await analyzeTimeline(access, timeline, source, state.mode, prompt);
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
