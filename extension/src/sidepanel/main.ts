import { describeLessonFrames } from "../lib/describeFrames";
import { lessonHtml, LESSON_CSS } from "../lib/lessonReport";
import { lessonCopy } from "../lib/lessonCopy";
import { bindLessonStudy } from "../lib/lessonStudy";
import { procedureFrameTimestamps } from "../lib/procedure";
import { procedureCopy } from "../lib/procedureCopy";
import { procedureHtml, procedureChecklist, PROCEDURE_CSS } from "../lib/procedureReport";
import { describeProcedureFrames } from "../lib/describeProcedureFrames";
import { failureCode, recoveryHint, needsManagedContinuation } from "../lib/activation";
import { analyzeTimeline, askQuestion, estimateCost, fmtTs } from "../lib/analyze";
import {
  captureTabFrames,
  ensureTabCapturePermission,
  fetchYouTubeCaptions,
  getActiveTabId,
  makeTabSource,
  planFrameTimestamps,
  probeTabVideo,
} from "../lib/capture";
import { DEFAULTS, LINKS } from "../lib/config";
import { describeFrames } from "../lib/describeFrames";
import { demoContent } from "../lib/demo";
import { uploadLocalLibrary, uploadReportCopy } from "../lib/cloudLibrary";
import { cloudCopy } from "../lib/cloudLibraryCopy";
import { readerCopy } from "../lib/readerCopy";
import { browserLanguage, documentLanguage, modeDefaultPrompt, modeLabel, t, type UiKey } from "../lib/i18n";
import {
  normalizeLanguageTag,
  reportCopy,
  REPORT_LANGUAGE_NAMES,
  REPORT_LANGUAGE_OPTIONS,
  resolveReportLanguage,
  type ConcreteReportLanguage,
  type ReportLanguage,
} from "../lib/languages";
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
  clearReportLibrary,
  countSavedReports,
  deleteSavedReport,
  ensurePersistentReportStorage,
  exportReportLibrary,
  getReportLibraryStorageStatus,
  getSavedReport,
  importReportLibrary,
  listSavedReports,
  MAX_LIBRARY_IMPORT_BYTES,
  ReportLibraryQuotaError,
  saveReport,
  type SavedReportSummary,
} from "../lib/reportLibrary";
import {
  acceptPrivacyDisclosure,
  getAnalysisProvider,
  getApiKey,
  getProCloudSave,
  getCloudLibraryEnabled,
  getStartupSettings,
  setCloudLibraryEnabled,
  getProSession,
  resetPrivacyDisclosure,
  markFirstReportCompleted,
  setAnalysisProvider,
  setApiKey,
  setMaxFrames,
  setReportLanguage,
  type AnalysisProvider,
  type StoredProSession,
} from "../lib/storage";
import { buildTimeline } from "../lib/timeline";
import { MODE_ORDER } from "../lib/modes";
import { recipeFrameTimestamps, type RecipeContext } from "../lib/recipe";
import { describeRecipeFrames } from "../lib/describeFrames";
import { fetchRecipeCreatorText } from "../lib/capture";
import { analyzeRecipeWithResearch } from "../lib/recipeAnalysis";
import { recipeCopy } from "../lib/recipeCopy";
import { recipeHtml, RECIPE_CSS } from "../lib/recipeReport";
import type { Analysis, AnalysisMode, CapturedFrame, QaEntry, Transcript } from "../lib/types";

type SourceKind = "tab" | "file";
type PanelView = "home" | "reportSetup" | "accessSetup" | "library" | "settings" | "progress" | "results";

interface State {
  recipeLookup: boolean;
  view: PanelView;
  sourceKind: SourceKind;
  mode: AnalysisMode;
  prompt: string;
  maxFrames: number;
  setupMaxFrames: number;
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
  reportLanguage: ReportLanguage;
  savedReportId: string | null;
  recentReports: SavedReportSummary[];
  savedReportCount: number;
  libraryError: string | null;
  libraryExpanded: boolean;
  libraryQuery: string;
  libraryLatestReportId: string | null;
  libraryInvalidCount: number;
  libraryNotice: string | null;
  libraryStorageRatio: number | null;
  libraryStorageFull: boolean;
  libraryLoading: boolean;
  hasCompletedFirstReport: boolean;
  privateAccessReady: boolean;
  modePickerExpanded: boolean;
  moreOptionsExpanded: boolean;
  startupError: string | null;
}

const state: State = {
  recipeLookup: false,
  view: "home",
  sourceKind: "tab",
  mode: "general",
  prompt: "",
  maxFrames: DEFAULTS.maxFrames,
  setupMaxFrames: DEFAULTS.maxFrames,
  localVideo: null,
  analysis: null,
  qa: [],
  error: null,
  privacyDisclosureAccepted: false,
  analysisProvider: "pro",
  proSession: null,
  proEntitlement: null,
  proCloudSave: false,
  managedReportId: null,
  reportLanguage: "browser",
  savedReportId: null,
  recentReports: [],
  savedReportCount: 0,
  libraryError: null,
  libraryExpanded: false,
  libraryQuery: "",
  libraryLatestReportId: null,
  libraryInvalidCount: 0,
  libraryNotice: null,
  libraryStorageRatio: null,
  libraryStorageFull: false,
  libraryLoading: true,
  hasCompletedFirstReport: false,
  privateAccessReady: false,
  modePickerExpanded: false,
  moreOptionsExpanded: false,
  startupError: null,
};

const PRIMARY_REPORT_MODES: AnalysisMode[] = ["general", "key_insights", "tutorial", "lesson", "interview"];
let reportStylesLoaded = false;
function ensureReportStyles(): void {
  if (reportStylesLoaded) return;
  const style = document.createElement("style");
  style.textContent = RECIPE_CSS + PROCEDURE_CSS + LESSON_CSS;
  document.head.appendChild(style);
  reportStylesLoaded = true;
}
let analysisInFlight = false;
let accountRefreshing = false;
let lastAccountRefresh = 0;
let librarySearchTimer: number | null = null;
let libraryRefreshSequence = 0;
let libraryHydration: Promise<void> | null = null;
let startupReady = false;
let cloudLibraryEnabled = false;
let cloudUploadBusy = false;
let cloudUploadCancelled = false;
let cloudUploadNotice = "";

function updateCloudUploadStatus(): void {
  const status = document.getElementById("cloud-upload-status");
  if (status) status.textContent = cloudUploadNotice;
  const button = document.getElementById("upload-library") as HTMLButtonElement | null;
  if (button) button.disabled = cloudUploadBusy;
}

async function uploadExistingLibrary(): Promise<void> {
  if (cloudUploadBusy || !state.proSession) return;
  const session = state.proSession;
  cloudUploadBusy = true;
  cloudUploadCancelled = false;
  updateCloudUploadStatus();
  try {
    const count = await countSavedReports();
    if (count && !confirm(cloudCopy("confirm", { count, email: session.email }))) return;
    const result = await uploadLocalLibrary(session.token, (progress) => {
      cloudUploadNotice = `${cloudCopy("progress", { done: progress.done, total: progress.total, failed: progress.failed })} ${cloudCopy("stay")}`;
      updateCloudUploadStatus();
    }, () => cloudUploadCancelled);
    cloudUploadNotice = result.cancelled ? cloudCopy("stopped") : cloudCopy("finished", { done: result.done, failed: result.failed, skipped: result.skipped });
  } catch {
    cloudUploadNotice = cloudCopy("failed");
  } finally {
    cloudUploadBusy = false;
    updateCloudUploadStatus();
  }
}

const root = document.getElementById("view-root")!;
const badge = document.getElementById("entitlement-badge")!;
const libraryButton = document.getElementById("btn-library") as HTMLButtonElement;
const libraryLabel = document.getElementById("library-label")!;
const settingsButton = document.getElementById("btn-settings") as HTMLButtonElement;
const hasExtensionStorage = typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
document.documentElement.lang = documentLanguage();
document.title = "VideoLens";
libraryButton.title = t("reportLibrary");
libraryButton.setAttribute("aria-label", t("reportLibrary"));
libraryLabel.textContent = t("libraryNav");
settingsButton.title = t("settings");
settingsButton.setAttribute("aria-label", t("settings"));
libraryButton.addEventListener("click", () => {
  if (state.startupError || !state.privacyDisclosureAccepted || state.view === "progress") return;
  state.view = state.view === "library" ? "home" : "library";
  state.error = null;
  render();
  if (state.view === "library") void loadReportLibraryOnDemand();
});
settingsButton.addEventListener("click", () => {
  if (state.startupError || !state.privacyDisclosureAccepted || state.view === "progress") return;
  state.view = state.view === "settings" ? "home" : "settings";
  state.error = null;
  render();
});

void initializeSidePanel();

async function initializeSidePanel(): Promise<void> {
  try {
    // A localhost-only preview path lets the exact packaged UI and report be
    // visually tested and captured without installing an unpacked extension.
    if (!hasExtensionStorage) {
      await initializePreview();
      render();
      return;
    }

    await loadStoredSettings();
    if (!state.privacyDisclosureAccepted) {
      render();
      return;
    }

    // The home screen only waits for one small storage read.
    render();
    startupReady = true;
    lastAccountRefresh = Date.now();
    void hydrateDeferredState();
  } catch (error) {
    console.error("VideoLens startup:", error);
    state.startupError = t("startupFailedBody");
    render();
  }
}

async function loadStoredSettings(): Promise<void> {
  const settings = await getStartupSettings(DEFAULTS.maxFrames);
  state.privacyDisclosureAccepted = settings.privacyDisclosureAccepted;
  state.maxFrames = settings.maxFrames;
  state.reportLanguage = settings.reportLanguage;
  state.analysisProvider = settings.analysisProvider;
  state.proCloudSave = settings.proCloudSave;
  cloudLibraryEnabled = settings.cloudLibraryEnabled;
  state.proSession = settings.proSession;
  state.privateAccessReady = settings.privateAccessReady;
  state.hasCompletedFirstReport = settings.hasCompletedFirstReport;
}

async function initializePreview(): Promise<void> {
    const preview = new URLSearchParams(location.search).get("preview");
    const demo = demoContent(documentLanguage());
    if (preview === "report") {
      const reportDocument = new window.DOMParser().parseFromString(toHtmlReport(demo.analysis, demo.qa), "text/html");
      document.documentElement.replaceWith(document.importNode(reportDocument.documentElement, true));
      return;
    }
    state.privacyDisclosureAccepted = preview !== "privacy";
    if (preview === "results") {
      state.analysis = demo.analysis;
      state.qa = [...demo.qa];
      state.view = "results";
    }
    if (preview === "library" && typeof indexedDB !== "undefined") {
      if (await countSavedReports() === 0) {
        await saveReport({ analysis: demo.analysis, qa: demo.qa });
        await saveReport({
          analysis: {
            ...demo.analysis,
            source: { ...demo.analysis.source, title: "Product onboarding review" },
            mode: "ux",
          },
          qa: [],
        });
      }
      const library = await listSavedReports({ limit: 6 });
      state.recentReports = library.reports;
      state.savedReportCount = library.total;
      state.libraryLatestReportId = library.latestReportId;
      state.libraryInvalidCount = library.invalid;
      state.libraryLoading = false;
      state.view = "library";
    }
    if (preview !== "library") state.libraryLoading = false;
}

async function hydrateDeferredState(): Promise<void> {
  const hadSession = Boolean(state.proSession);
  void hydrateProState().then(() => {
    if (state.view === "home" && !hadSession && state.proSession) render();
    else renderBadge();
  });
  if (state.view === "home") {
    const { checkoutReportId } = await chrome.storage.local.get("checkoutReportId");
    if (typeof checkoutReportId === "string" && state.view === "home") {
      await chrome.storage.local.remove("checkoutReportId");
      await openLocalReport(checkoutReportId);
    }
  }
}

function loadReportLibraryOnDemand(): Promise<void> {
  if (!state.libraryLoading) return Promise.resolve();
  if (!libraryHydration) libraryHydration = (async () => {
    try {
      await ensurePersistentReportStorage();
      await refreshReportLibrary();
      if (!state.hasCompletedFirstReport && state.savedReportCount > 0) {
        state.hasCompletedFirstReport = true;
        if (hasExtensionStorage) void markFirstReportCompleted().catch((error) => console.error("first-report state:", error));
      }
    } finally {
      state.libraryLoading = false;
      if (state.view === "library") render();
    }
  })();
  return libraryHydration;
}

async function hydrateProState(): Promise<void> {
  try {
    if (!state.proSession) state.proSession = await resumeProConnection();
    state.proEntitlement = state.proSession
      ? await fetchProEntitlement(state.proSession.token).catch(() => null)
      : null;
  } catch (error) {
    console.error("Pro recovery:", error);
    state.proEntitlement = null;
  }
}

async function refreshAccountAccess(manual = false): Promise<void> {
  if (!hasExtensionStorage || analysisInFlight || accountRefreshing) return;
  accountRefreshing = true;
  try {
    state.proSession = await getProSession() || await resumeProConnection();
    if (!state.proSession) { render(); return; }
    state.proEntitlement = await fetchProEntitlement(state.proSession.token);
    lastAccountRefresh = Date.now();
    render();
  } catch {
    if (manual) { state.error = "Account access could not be refreshed. Check your connection and try again."; render(); }
    // A transient refresh never removes a usable report or resets the user's setup.
  } finally { accountRefreshing = false; }
}
window.addEventListener("focus", () => {
  if (startupReady && Date.now() - lastAccountRefresh > 5000) void refreshAccountAccess();
});

async function continueWithManaged(): Promise<void> {
  try {
    if (state.analysis) {
      await persistCurrentReport(true);
      if (!state.savedReportId) { render(); return; }
      await chrome.storage.local.set({ checkoutReportId: state.savedReportId });
    }
    openProAccount();
  } catch {
    state.error = t("librarySaveFailed");
    render();
  }
}

// ── rendering ───────────────────────────────────────────────────────────────

function render(): void {
  const navigationDisabled = Boolean(state.startupError) || !state.privacyDisclosureAccepted || state.view === "progress";
  settingsButton.disabled = navigationDisabled;
  libraryButton.disabled = navigationDisabled;
  settingsButton.classList.toggle("active", state.view === "settings");
  libraryButton.classList.toggle("active", state.view === "library");
  renderBadge();
  root.classList.toggle(
    "results-view",
    !state.startupError && state.privacyDisclosureAccepted && state.view === "results" && Boolean(state.analysis),
  );
  if (state.view === "progress") return;
  root.replaceChildren();
  if (state.startupError) renderStartupError();
  else if (!state.privacyDisclosureAccepted) renderPrivacyDisclosure();
  else if (state.view === "settings") renderSettings();
  else if (state.view === "library") renderLibraryView();
  else if (state.view === "reportSetup") renderReportSetup();
  else if (state.view === "accessSetup") renderAccessSetup();
  else if (state.view === "results" && state.analysis) renderResults();
  else renderHome();
}

function renderStartupError(): void {
  badge.textContent = t("startupFailedBadge");
  badge.className = "brand-badge";
  const section = el(
    `<section class="startup-state" role="alert">
      <h1>${esc(t("startupFailedTitle"))}</h1>
      <p>${esc(state.startupError ?? t("startupFailedBody"))}</p>
      <button class="btn btn-primary" id="reload-extension">${esc(t("reloadExtension"))}</button>
    </section>`,
  );
  section.querySelector("#reload-extension")!.addEventListener("click", () => location.reload());
  root.appendChild(section);
}

function renderPrivacyDisclosure(): void {
  badge.textContent = t("privacyFirst");
  badge.className = "brand-badge";

  const disclosure = el(
    `<section class="privacy-disclosure" aria-labelledby="privacy-title">
      <div class="privacy-lock" aria-hidden="true">✓</div>
      <h1 id="privacy-title">${esc(t("beforeAnalyze"))}</h1>
      <p>${esc(t("disclosureIntro"))}</p>
      <div class="privacy-promises">
        <p><b>${esc(t("privacyLocalSummary"))}</b></p>
        <p><b>${esc(t("privacyChoiceSummary"))}</b></p>
      </div>
      <details class="privacy-details">
        <summary>${esc(t("privacyDetails"))}</summary>
        <ul class="privacy-list">
          <li><b>${esc(t("disclosurePrivateTitle"))}</b> ${esc(t("disclosurePrivateBody"))}</li>
          <li><b>${esc(t("disclosureProTitle"))}</b> ${esc(t("disclosureProBody"))}</li>
          <li><b>${esc(t("disclosureLocalTitle"))}</b> ${esc(t("disclosureLocalBody"))}</li>
          <li><b>${esc(t("disclosureCloudTitle"))}</b> ${esc(t("disclosureCloudBody"))}</li>
        </ul>
        <div class="privacy-note">${esc(t("disclosureNote"))}</div>
      </details>
      <button class="btn btn-primary" id="accept-privacy">${esc(t("disclosureAccept"))}</button>
      <p class="privacy-links"><a href="${LINKS.privacy}" target="_blank">${esc(t("privacyPolicy"))}</a></p>
    </section>`,
  );
  root.appendChild(disclosure);

  disclosure.querySelector("#accept-privacy")!.addEventListener("click", async () => {
    await acceptPrivacyDisclosure();
    state.privacyDisclosureAccepted = true;
    await loadStoredSettings();
    render();
    void hydrateDeferredState();
  });
}

function renderBadge(): void {
  if (!state.privacyDisclosureAccepted) return;
  const ready = isProviderReady(state.analysisProvider);
  badge.textContent = ready ? (state.analysisProvider === "pro" ? (state.proEntitlement?.plan === "pro" ? "PRO" : t("free")) : t("privateBadge")) : "";
  badge.className = `brand-badge ${ready && state.analysisProvider === "pro" ? "pro" : ""}`;
}

function renderHome(): void {
  appendCurrentError();

  const introduction = state.hasCompletedFirstReport
    ? el(`<section class="home-heading compact-home"><h1>${esc(t("newReport"))}</h1></section>`)
    : el(
        `<section class="product-intro home-heading">
          <div class="product-kicker">${esc(t("productKicker"))}</div>
          <h1>${esc(t("productTitle"))}</h1>
          <p>${esc(t("productBody"))}</p>
        </section>`,
      );
  root.appendChild(introduction);

  if (!state.proSession && !state.privateAccessReady) {
    const signup = el(`<section class="access-card managed-access account-start"><h2>${esc(t("managedAccessTitle"))}</h2><p>${esc(t("managedAccessBody"))}</p><button class="btn btn-primary" id="home-create-account">${esc(t("connectAccount"))}</button><button class="btn btn-ghost btn-sm" id="home-use-key">${esc(t("privateAccessTitle"))}</button></section>`);
    signup.querySelector<HTMLButtonElement>("#home-create-account")!.addEventListener("click", (event) => void connectManagedAccess(event.currentTarget as HTMLButtonElement));
    signup.querySelector("#home-use-key")!.addEventListener("click", () => {
      state.view = "settings";
      render();
      document.querySelector("#private-key-settings")?.setAttribute("open", "");
    });
    root.appendChild(signup);
  }

  const sourceSection = el(
    `<section class="source-start" aria-labelledby="source-title">
      <h2 id="source-title">${esc(t("chooseSource"))}</h2>
      <div class="source-actions"></div>
    </section>`,
  );
  const actions = sourceSection.querySelector(".source-actions")!;
  const pageButton = el(
    `<button class="source-choice source-choice-primary" id="choose-page-video">
      <span class="source-choice-icon" aria-hidden="true">▶</span>
      <span><b>${esc(t("videoOnPage"))}</b><small>${esc(t("pageSourceHelp"))}</small></span>
      <span class="source-choice-arrow" aria-hidden="true">→</span>
    </button>`,
  ) as HTMLButtonElement;
  const fileButton = el(
    `<button class="source-choice" id="choose-local-file">
      <span class="source-choice-icon file-icon" aria-hidden="true">＋</span>
      <span><b>${esc(t("localFile"))}</b><small>${esc(t("fileSourceHelp"))}</small></span>
      <span class="source-choice-arrow" aria-hidden="true">→</span>
    </button>`,
  ) as HTMLButtonElement;
  const fileInput = el(`<input type="file" accept="video/*,.mkv" hidden>`) as HTMLInputElement;
  pageButton.addEventListener("click", () => openReportSetup("tab"));
  fileButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => void selectLocalVideo(fileInput));
  actions.append(pageButton, fileButton, fileInput);
  root.appendChild(sourceSection);

  if (!state.hasCompletedFirstReport) {
    const sample = el(`<button class="sample-link home-sample" id="view-sample">${esc(t("sampleReport"))}</button>`);
    sample.addEventListener("click", showSampleReport);
    root.appendChild(sample);
  }
}

function openReportSetup(sourceKind: SourceKind): void {
  state.sourceKind = sourceKind;
  state.mode = "general";
  state.prompt = "";
  state.setupMaxFrames = Math.min(state.maxFrames, state.analysisProvider === "pro" ? 40 : 80);
  state.modePickerExpanded = false;
  state.moreOptionsExpanded = false;
  state.analysis = null;
  state.qa = [];
  state.savedReportId = null;
  state.managedReportId = null;
  state.error = null;
  state.view = "reportSetup";
  render();
}

async function selectLocalVideo(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (!file) return;
  if (state.localVideo) closeLocalVideo(state.localVideo);
  state.localVideo = null;
  state.error = null;
  try {
    state.localVideo = await openLocalVideo(file);
    openReportSetup("file");
  } catch (error) {
    state.error = localizeKnownError((error as Error).message);
    state.view = "home";
    render();
  }
}

function showSampleReport(): void {
  const demo = demoContent(documentLanguage());
  state.analysis = demo.analysis;
  state.qa = [...demo.qa];
  state.savedReportId = null;
  state.managedReportId = null;
  state.view = "results";
  state.error = null;
  render();
}

function renderReportSetup(): void {
  const back = el(`<button class="back-link">${esc(t("back"))}</button>`);
  back.addEventListener("click", () => {
    state.view = "home";
    state.error = null;
    render();
  });
  root.appendChild(back);
  appendCurrentError();

  root.appendChild(
    el(`<section class="setup-heading"><div class="product-kicker">${esc(t("reportSetupKicker"))}</div><h1>${esc(t("confirmReport"))}</h1></section>`),
  );

  const sourceName = state.sourceKind === "file" && state.localVideo
    ? state.localVideo.file.name
    : t("videoOnPage");
  const sourceMeta = state.sourceKind === "file" && state.localVideo
    ? fmtTs(state.localVideo.duration)
    : t("pageSourceHelp");
  root.appendChild(
    el(`<div class="source-summary"><span class="source-summary-icon" aria-hidden="true">${state.sourceKind === "file" ? "＋" : "▶"}</span><span><b>${esc(sourceName)}</b><small>${esc(sourceMeta)}</small></span></div>`),
  );

  const modeCard = el(
    `<section class="report-choice" aria-labelledby="report-choice-title">
      <span class="label">${esc(t("reportStyle"))}</span>
      <div class="report-choice-row">
        <div><h2 id="report-choice-title">${esc(modeLabel(state.mode))}</h2><p>${esc(modeDefaultPrompt(state.mode))}</p></div>
        <button class="change-link" id="change-report-type" aria-expanded="${state.modePickerExpanded}">${esc(t("changeReportType"))}</button>
      </div>
    </section>`,
  );
  modeCard.querySelector("#change-report-type")!.addEventListener("click", () => {
    state.modePickerExpanded = !state.modePickerExpanded;
    render();
  });
  if (state.modePickerExpanded) modeCard.appendChild(createModeSelect());
  root.appendChild(modeCard);

  if (state.mode === "lesson") root.append(el(`<section class="card"><p class="hint">${esc(lessonCopy(documentLanguage()).prompt)}</p></section>`));
  if (state.mode === "tutorial") root.append(el(`<section class="card"><p class="hint">${esc(procedureCopy(documentLanguage()).sampling)}</p></section>`));
  if (state.mode === "recipe") {
    const copy = recipeCopy(documentLanguage());
    const options = el(`<section class="card"><p class="hint">${esc(copy.sampling)}</p><label class="recipe-lookup-label"><input type="checkbox" id="recipe-lookup" ${state.recipeLookup ? "checked" : ""}> ${esc(copy.lookup)}</label><p class="hint">${esc(copy.lookupHelp)}</p></section>`);
    options.querySelector<HTMLInputElement>("#recipe-lookup")!.addEventListener("change", event => {
      state.recipeLookup = (event.target as HTMLInputElement).checked;
    });
    root.appendChild(options);
  }

  const advanced = el(
    `<details class="advanced-options" ${state.moreOptionsExpanded ? "open" : ""}>
      <summary>${esc(t("moreOptions"))}<span>${esc(t("moreOptionsSummary"))}</span></summary>
      <div class="advanced-options-body"></div>
    </details>`,
  ) as HTMLDetailsElement;
  advanced.addEventListener("toggle", () => {
    state.moreOptionsExpanded = advanced.open;
  });
  renderAdvancedOptions(advanced.querySelector(".advanced-options-body")!);
  root.appendChild(advanced);

  const run = el(`<button class="btn btn-primary create-report">${esc(t("createReport"))}</button>`) as HTMLButtonElement;
  run.addEventListener("click", requestAnalysisStart);
  const cost = el(`<div class="cost setup-cost"></div>`);
  updateCostDisclosure(cost);
  root.append(run, cost);
}

function createModeSelect(): HTMLSelectElement {
  const select = el(`<select class="report-mode-select" aria-label="${esc(t("reportStyle"))}"></select>`) as HTMLSelectElement;
  const primaryGroup = document.createElement("optgroup");
  primaryGroup.label = t("writtenReports");
  const specialistGroup = document.createElement("optgroup");
  specialistGroup.label = t("specializedAnalysis");
  for (const mode of MODE_ORDER) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = modeLabel(mode);
    option.selected = mode === state.mode;
    (PRIMARY_REPORT_MODES.includes(mode) ? primaryGroup : specialistGroup).appendChild(option);
  }
  select.append(primaryGroup, specialistGroup);
  select.addEventListener("change", () => {
    state.mode = select.value as AnalysisMode;
    state.prompt = "";
    state.modePickerExpanded = false;
    render();
  });
  return select;
}

function renderAdvancedOptions(container: Element): void {
  const languageSection = el(`<div class="section"><span class="label">${esc(t("reportLanguage"))}</span></div>`);
  const languageSelect = el(`<select></select>`) as HTMLSelectElement;
  for (const language of REPORT_LANGUAGE_OPTIONS) {
    const option = document.createElement("option");
    option.value = language;
    option.textContent = language === "browser"
      ? t("browserLanguage")
      : language === "source"
        ? t("sameAsVideo")
        : REPORT_LANGUAGE_NAMES[language];
    option.selected = language === state.reportLanguage;
    languageSelect.appendChild(option);
  }
  languageSelect.addEventListener("change", () => {
    state.reportLanguage = languageSelect.value as ReportLanguage;
    if (hasExtensionStorage) void setReportLanguage(state.reportLanguage);
  });
  languageSection.append(languageSelect, el(`<p class="hint">${esc(t("reportLanguageHelp"))}</p>`));

  const promptSection = el(`<div class="section"><span class="label">${esc(t("focus"))} <span class="optional">${esc(t("optional"))}</span></span></div>`);
  const textarea = el(`<textarea placeholder="${esc(modeDefaultPrompt(state.mode))}"></textarea>`) as HTMLTextAreaElement;
  textarea.value = state.prompt;
  textarea.addEventListener("input", () => (state.prompt = textarea.value));
  promptSection.appendChild(textarea);

  const sliderMax = state.analysisProvider === "byok" ? 80 : 40;
  const effectiveMaxFrames = Math.min(state.setupMaxFrames, sliderMax);
  const framesSection = el(`<div class="section"><span class="label">${esc(t("maxFrames", { count: effectiveMaxFrames }))}</span></div>`);
  const slider = el(`<input type="range" min="5" max="${sliderMax}" step="5">`) as HTMLInputElement;
  slider.value = String(effectiveMaxFrames);
  slider.addEventListener("input", () => {
    state.setupMaxFrames = Number(slider.value);
    state.maxFrames = state.setupMaxFrames;
    framesSection.querySelector(".label")!.textContent = t("maxFrames", { count: state.setupMaxFrames });
    const cost = root.querySelector<HTMLElement>(".setup-cost");
    if (cost) updateCostDisclosure(cost);
    if (hasExtensionStorage) void setMaxFrames(state.maxFrames);
  });
  framesSection.appendChild(slider);
  container.append(languageSection, promptSection);
  if (state.mode !== "recipe" && state.mode !== "tutorial") container.append(framesSection);
}

function updateCostDisclosure(cost: HTMLElement): void {
  if (state.mode === "tutorial") {
    cost.textContent = procedureCopy(documentLanguage()).cost;
  } else if (state.mode === "recipe") {
    cost.textContent = recipeCopy(documentLanguage()).cost + (state.analysisProvider === "pro" && isProviderReady("pro") ? ` ${t("includedAllowance")}.` : "");
    return;
  }
  if (!isProviderReady(state.analysisProvider)) {
    cost.textContent = t("accessAfterCreate");
    return;
  }
  if (state.analysisProvider === "pro") {
    cost.replaceChildren(el(`<span><b>${esc(t("includedAllowance"))}</b> · ${esc(t("sampledFrames40"))}</span>`));
    return;
  }
  const minutes = state.sourceKind === "file" && state.localVideo ? state.localVideo.duration / 60 : 3.0;
  const [low, high] = estimateCost(state.setupMaxFrames, Math.max(0.5, minutes));
  const assumed = state.sourceKind === "file" && state.localVideo ? t("yourFile") : t("threeMinuteVideo");
  cost.replaceChildren(el(`<span>${esc(t("estimatedCost"))} <b>~$${low.toFixed(2)}–$${high.toFixed(2)}</b> · ${esc(assumed)} · ${esc(t("billedToKey"))}</span>`));
}

function requestAnalysisStart(): void {
  state.error = null;
  if (!isProviderReady(state.analysisProvider)) {
    state.view = "accessSetup";
    render();
    return;
  }
  void runAnalysis();
}

function isProviderReady(provider: AnalysisProvider): boolean {
  if (provider === "byok") return state.privateAccessReady;
  if (!state.proSession) return false;
  return state.proEntitlement === null
    || (state.proEntitlement.canUseManagedAi && state.proEntitlement.managedReportsRemaining > 0);
}

function renderAccessSetup(): void {
  const back = el(`<button class="back-link">${esc(t("backToReport"))}</button>`);
  back.addEventListener("click", () => {
    state.view = "reportSetup";
    state.error = null;
    render();
  });
  root.appendChild(back);
  appendCurrentError();
  root.appendChild(
    el(`<section class="setup-heading access-heading"><div class="product-kicker">${esc(t("aiAccessKicker"))}</div><h1>${esc(state.proSession ? t("account") : t("chooseAiAccess"))}</h1><p>${esc(state.proSession ? t("noApiKey") : t("chooseAiAccessBody"))}</p></section>`),
  );

  const managedReady = isProviderReady("pro");
  const managedUnavailable = Boolean(state.proSession && state.proEntitlement && !managedReady);
  const managed = el(
    `<section class="access-card managed-access">
      <div class="access-card-heading"><span class="plan-pill">${state.proSession && state.proEntitlement?.plan === "pro" ? "PRO" : esc(t("starter"))}</span><h2>${esc(state.proSession ? t("account") : t("managedAccessTitle"))}</h2></div>
      <p>${esc(managedUnavailable ? "Your report allowance is used up. Open your account to view your plan and options for continuing. Your saved reports stay available." : state.proSession ? t("noApiKey") : t("managedAccessBody"))}</p>
      ${state.proSession ? `<small>${esc(state.proSession.email)}${state.proEntitlement ? ` · ${esc(t("reportsRemaining", { remaining: state.proEntitlement.managedReportsRemaining, limit: state.proEntitlement.managedReportsLimit }))}` : ""}</small>` : ""}
      <button class="btn btn-primary" id="managed-access-action">${esc(managedReady ? t("createReport") : managedUnavailable ? t("accountBilling") : t("connectAccount"))}</button>
    </section>`,
  );
  const managedButton = managed.querySelector<HTMLButtonElement>("#managed-access-action")!;
  if (managedReady) {
    managedButton.addEventListener("click", () => startWithProvider("pro"));
  } else if (managedUnavailable) {
    managedButton.addEventListener("click", () => void continueWithManaged());
  } else {
    managedButton.addEventListener("click", () => void connectManagedAccess(managedButton));
  }
  if (state.proSession) {
    const refresh = el('<button class="btn btn-ghost btn-sm" id="refresh-managed-access">Refresh account access</button>');
    refresh.addEventListener("click", () => void refreshAccountAccess(true));
    managed.appendChild(refresh);
  }
  root.appendChild(managed);

  const privateCard = el(
    `<details class="access-card private-access" ${state.analysisProvider === "byok" ? "open" : ""}>
      <summary>${esc(t("privateAccessTitle"))}</summary>
      <p>${esc(t("privateAccessBody"))}</p>
      <div class="private-access-controls"></div>
    </details>`,
  );
  const privateControls = privateCard.querySelector(".private-access-controls")!;
  if (state.privateAccessReady) {
    const usePrivate = el(`<button class="btn btn-secondary">${esc(t("usePrivateAccess"))}</button>`) as HTMLButtonElement;
    usePrivate.addEventListener("click", () => startWithProvider("byok"));
    privateControls.appendChild(usePrivate);
  } else {
    const keyRow = el(
      `<form class="row"><input type="password" class="grow" id="access-api-key" placeholder="sk-..." aria-label="${esc(t("privateApiKey"))}"><button type="submit" class="btn btn-secondary btn-sm" id="save-access-key">${esc(t("saveKeyForReport"))}</button></form>`,
    );
    const keyInput = keyRow.querySelector<HTMLInputElement>("#access-api-key")!;
    const saveButton = keyRow.querySelector<HTMLButtonElement>("#save-access-key")!;
    keyRow.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveAccessKey(keyInput, saveButton);
    });
    privateControls.append(keyRow, el(`<p class="hint access-key-help"><a href="${LINKS.openaiKeys}" target="_blank">${esc(t("getKey"))}</a></p>`));
  }
  root.appendChild(privateCard);
}

function startWithProvider(provider: AnalysisProvider): void {
  state.analysisProvider = provider;
  state.error = null;
  void runAnalysis();
  if (hasExtensionStorage) void setAnalysisProvider(provider);
}

async function connectManagedAccess(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.textContent = t("waitingApproval");
  try {
    state.proSession = await startProConnection();
    cloudLibraryEnabled = await getCloudLibraryEnabled();
    state.proEntitlement = await fetchProEntitlement(state.proSession.token);
    state.analysisProvider = "pro";
    if (hasExtensionStorage) await setAnalysisProvider("pro");
    state.error = null;
  } catch (error) {
    state.error = localizeKnownError((error as Error).message);
  }
  render();
}

async function saveAccessKey(input: HTMLInputElement, button: HTMLButtonElement): Promise<void> {
  const key = input.value.trim();
  if (!key) return;
  button.disabled = true;
  button.textContent = t("checkingKey");
  const valid = await verifyApiKey(key).catch(() => false);
  if (!valid) {
    state.error = t("keyRejected");
    render();
    return;
  }
  await setApiKey(key);
  await setAnalysisProvider("byok");
  state.privateAccessReady = true;
  state.analysisProvider = "byok";
  state.error = null;
  render();
}

function renderLibraryView(): void {
  const back = el(`<button class="back-link">${esc(t("back"))}</button>`);
  back.addEventListener("click", () => {
    state.view = "home";
    render();
  });
  root.append(back, renderReportLibrary());
}

function appendCurrentError(): void {
  if (state.error) root.appendChild(el(`<div class="banner error">${esc(state.error)}</div>`));
}

function renderReportLibrary(): HTMLElement {
  const section = el(
    `<section class="report-library" aria-labelledby="report-library-title">
      <div class="library-heading">
        <h2 id="report-library-title">${esc(t("reportLibrary"))}</h2>
        <span>${esc(t("reportsSavedLocally", { count: state.savedReportCount }))}</span>
      </div>
      <p class="library-help">${esc(t("localLibraryHelp"))}</p>
    </section>`,
  );

  if (state.libraryError) {
    section.appendChild(el(`<div class="banner error library-error">${esc(state.libraryError)}</div>`));
  }
  if (state.libraryNotice) {
    section.appendChild(el(`<div class="banner ok library-error" aria-live="polite">${esc(state.libraryNotice)}</div>`));
  }
  if (state.libraryStorageFull) {
    section.appendChild(el(`<div class="banner error library-error">${esc(t("storageFullWarning"))}</div>`));
  } else if (state.libraryStorageRatio !== null && state.libraryStorageRatio >= 0.85) {
    section.appendChild(el(`<div class="banner trial library-error">${esc(t("storagePressureWarning", {
      percent: Math.min(100, Math.round(state.libraryStorageRatio * 100)),
    }))}</div>`));
  }
  if (state.libraryInvalidCount > 0) {
    section.appendChild(el(`<div class="banner trial library-error">${esc(t("corruptReportsIsolated", {
      count: state.libraryInvalidCount,
    }))}</div>`));
  }

  if (state.libraryLoading) {
    section.appendChild(el(`<p class="library-empty" role="status">${esc(t("libraryLoading"))}</p>`));
    return section;
  }

  if (state.libraryLatestReportId) {
    const continueButton = el(
      `<button class="btn btn-secondary library-continue">${esc(t("continueLastReport"))}</button>`,
    ) as HTMLButtonElement;
    continueButton.addEventListener("click", () => void openLocalReport(state.libraryLatestReportId!));
    section.appendChild(continueButton);
  }

  if (state.savedReportCount > 0) {
    const search = el(
      `<div class="library-search"><label for="library-search">${esc(t("searchReports"))}</label><input id="library-search" type="search" placeholder="${esc(t("searchReportsPlaceholder"))}"></div>`,
    );
    const searchInput = search.querySelector<HTMLInputElement>("#library-search")!;
    searchInput.value = state.libraryQuery;
    searchInput.addEventListener("input", () => {
      state.libraryQuery = searchInput.value;
      state.libraryExpanded = state.libraryQuery.trim().length > 0;
      if (librarySearchTimer !== null) window.clearTimeout(librarySearchTimer);
      librarySearchTimer = window.setTimeout(async () => {
        await refreshReportLibrary();
        render();
        const nextInput = root.querySelector<HTMLInputElement>("#library-search");
        nextInput?.focus();
        nextInput?.setSelectionRange(nextInput.value.length, nextInput.value.length);
      }, 180);
    });
    section.appendChild(search);
  }

  if (state.recentReports.length > 0) {
    const recentHeading = el(`<div class="library-recent-heading">${esc(state.libraryQuery.trim()
      ? t("searchResults")
      : t("recentReports"))}</div>`);
    const list = el(`<div class="library-list"></div>`);
    for (const report of state.recentReports) {
      const title = report.title?.trim() || t("untitledVideo");
      const item = el(`<div class="library-item"></div>`);
      const openButton = el(
        `<button class="library-open" aria-label="${esc(`${readerCopy.open}: ${title}`)}" title="${esc(readerCopy.open)}">
          <span class="library-title">${esc(title)} ↗</span>
          <span class="library-meta">${esc(modeLabel(report.mode))} · ${esc(formatSavedDate(report.updatedAt))} · ${esc(t("followUpCount", { count: report.qaCount }))}</span>
        </button>`,
      ) as HTMLButtonElement;
      const deleteButton = el(
        `<button class="library-delete" aria-label="${esc(`${t("deleteReport")}: ${title}`)}" title="${esc(t("deleteReport"))}">×</button>`,
      ) as HTMLButtonElement;
      openButton.addEventListener("click", () => void openFullReport(report.id));
      const resumeButton = el(`<button class="library-resume" title="${esc(readerCopy.inline)}" aria-label="${esc(`${readerCopy.inline}: ${title}`)}">↩</button>`);
      resumeButton.addEventListener("click", () => void openLocalReport(report.id));
      deleteButton.addEventListener("click", () => void removeLocalReport(report.id));
      item.append(openButton, resumeButton, deleteButton);
      list.appendChild(item);
    }
    section.append(recentHeading, list);
  } else if (state.libraryQuery.trim()) {
    section.appendChild(el(`<p class="library-empty">${esc(t("noSearchResults"))}</p>`));
  } else if (state.savedReportCount === 0) {
    section.appendChild(el(`<div class="library-empty-state"><b>${esc(t("libraryEmptyTitle"))}</b><p>${esc(t("libraryEmptyBody"))}</p></div>`));
  }

  if (!state.libraryQuery.trim() && state.savedReportCount > 6) {
    const toggle = el(
      `<button class="library-toggle">${esc(state.libraryExpanded
        ? t("showRecentReports")
        : t("viewAllReports", { count: state.savedReportCount }))}</button>`,
    ) as HTMLButtonElement;
    toggle.addEventListener("click", async () => {
      state.libraryExpanded = !state.libraryExpanded;
      await refreshReportLibrary();
      render();
    });
    section.appendChild(toggle);
  }

  section.appendChild(renderLibraryTools());
  return section;
}

function renderLibraryTools(): HTMLElement {
  const tools = el(
    `<div class="library-tools"><div class="library-recent-heading">${esc(t("libraryTools"))}</div><div class="library-tool-row"></div></div>`,
  );
  const row = tools.querySelector<HTMLElement>(".library-tool-row")!;
  const importButton = el(`<button class="btn btn-ghost btn-sm">${esc(t("importLibrary"))}</button>`) as HTMLButtonElement;
  const importInput = el(`<input type="file" accept="application/json,.json" hidden>`) as HTMLInputElement;
  importButton.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (file) void importLocalLibraryFile(file);
  });
  row.append(importButton, importInput);

  if (state.savedReportCount > 0) {
    const exportButton = el(`<button class="btn btn-ghost btn-sm">${esc(t("exportLibrary"))}</button>`) as HTMLButtonElement;
    exportButton.addEventListener("click", () => void exportLocalLibrary());
    row.prepend(exportButton);
  }

  if (state.savedReportCount + state.libraryInvalidCount > 0) {
    const clearButton = el(`<button class="btn btn-ghost btn-sm library-clear">${esc(t("clearLibrary"))}</button>`) as HTMLButtonElement;
    clearButton.addEventListener("click", () => void clearLocalLibrary());
    row.appendChild(clearButton);
  }
  return tools;
}

async function exportLocalLibrary(): Promise<void> {
  try {
    const exported = await exportReportLibrary();
    download(
      `videolens-library-${new Date().toISOString().slice(0, 10)}.json`,
      exported.json,
      "application/json",
    );
    state.libraryNotice = exported.excludedInvalid > 0
      ? t("libraryExportExcluded", { count: exported.reportCount, invalid: exported.excludedInvalid })
      : t("libraryExported", { count: exported.reportCount });
    state.libraryError = null;
  } catch {
    state.libraryError = t("libraryExportFailed");
  }
  render();
}

async function importLocalLibraryFile(file: File): Promise<void> {
  if (file.size > MAX_LIBRARY_IMPORT_BYTES) {
    state.libraryError = t("libraryImportTooLarge");
    state.libraryNotice = null;
    render();
    return;
  }
  try {
    const result = await importReportLibrary(await file.text());
    state.libraryQuery = "";
    state.libraryExpanded = false;
    state.libraryStorageFull = false;
    state.libraryNotice = t("libraryImportComplete", {
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped,
      invalid: result.invalid,
    });
    state.libraryError = null;
    await refreshReportLibrary();
  } catch (error) {
    state.libraryNotice = null;
    state.libraryError = error instanceof ReportLibraryQuotaError
      ? t("storageFullWarning")
      : t("libraryImportFailed");
    if (error instanceof ReportLibraryQuotaError) state.libraryStorageFull = true;
  }
  render();
}

async function clearLocalLibrary(): Promise<void> {
  const entryCount = state.savedReportCount + state.libraryInvalidCount;
  if (!window.confirm(t("clearLibraryConfirm", { count: entryCount }))) return;
  try {
    await clearReportLibrary();
    if (state.savedReportId) {
      state.analysis = null;
      state.qa = [];
      state.managedReportId = null;
      state.savedReportId = null;
    }
    state.libraryQuery = "";
    state.libraryExpanded = false;
    state.libraryInvalidCount = 0;
    state.libraryStorageFull = false;
    state.libraryNotice = t("libraryCleared");
    state.libraryError = null;
    await refreshReportLibrary();
  } catch {
    state.libraryNotice = null;
    state.libraryError = t("libraryClearFailed");
  }
  render();
}

async function refreshReportLibrary(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const sequence = ++libraryRefreshSequence;
  try {
    const query = state.libraryQuery.trim();
    const [library, storage] = await Promise.all([
      listSavedReports({
        query,
        limit: query.length > 0 || state.libraryExpanded ? undefined : 6,
      }),
      getReportLibraryStorageStatus(),
    ]);
    if (sequence !== libraryRefreshSequence) return;
    state.recentReports = library.reports;
    state.savedReportCount = library.total;
    state.libraryLatestReportId = library.latestReportId;
    state.libraryInvalidCount = library.invalid;
    state.libraryStorageRatio = storage?.ratio ?? null;
    state.libraryError = null;
  } catch {
    if (sequence !== libraryRefreshSequence) return;
    state.libraryError = t("libraryLoadFailed");
  }
}

async function persistCurrentReport(localOnly = false): Promise<void> {
  if (!hasExtensionStorage || !state.analysis) return;
  try {
    const saved = await saveReport({
      id: state.savedReportId,
      analysis: state.analysis,
      qa: state.qa,
      managedReportId: state.managedReportId,
    });
    state.savedReportId = saved.id;
    state.libraryStorageFull = false;
    await refreshReportLibrary();
    void ensurePersistentReportStorage();
    if (!localOnly && state.proSession && await getCloudLibraryEnabled()) {
      try { await uploadReportCopy(state.proSession.token, saved, true); }
      catch { state.error = cloudCopy("failed"); }
    }
  } catch (error) {
    const isQuotaError = error instanceof ReportLibraryQuotaError;
    state.libraryStorageFull = isQuotaError;
    const message = isQuotaError ? t("storageFullWarning") : t("librarySaveFailed");
    state.error = state.error ? `${state.error} ${message}` : message;
  }
}

async function openLocalReport(id: string): Promise<void> {
  try {
    const report = await getSavedReport(id);
    if (!report) {
      state.error = t("reportNotFound");
      await refreshReportLibrary();
      render();
      return;
    }
    state.analysis = report.analysis;
    state.qa = report.qa.map((entry) => ({ ...entry }));
    state.savedReportId = report.id;
    state.managedReportId = report.managedReportId;
    state.error = null;
    state.view = "results";
  } catch {
    state.libraryError = t("libraryLoadFailed");
    state.view = "library";
  }
  render();
}

async function removeLocalReport(id: string): Promise<void> {
  if (!window.confirm(t("deleteReportConfirm"))) return;
  try {
    await deleteSavedReport(id);
    if (state.savedReportId === id) {
      state.savedReportId = null;
      state.managedReportId = null;
      state.analysis = null;
      state.qa = [];
    }
    await refreshReportLibrary();
  } catch {
    state.libraryError = t("libraryDeleteFailed");
  }
  render();
}

function formatSavedDate(timestamp: number): string {
  return new Intl.DateTimeFormat(documentLanguage(), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

async function chooseProvider(provider: AnalysisProvider, returnToMain = false): Promise<void> {
  if (provider === "byok" && !state.privateAccessReady) {
    state.error = t("addKeyFirst");
    state.view = "settings";
    render();
    document.querySelector("#private-key-settings")?.setAttribute("open", "");
    return;
  }
  if (provider === "pro" && !state.proSession) {
    state.error = t("connectManagedError");
    state.view = "settings";
    render();
    return;
  }
  state.analysisProvider = provider;
  await setAnalysisProvider(provider);
  if (provider === "pro" && state.proSession) {
    state.proEntitlement = await fetchProEntitlement(state.proSession.token).catch(() => null);
  }
  if (returnToMain) state.view = state.analysis ? "results" : "home";
  render();
}

interface StepHandle {
  set(index: number, status: "pending" | "active" | "done", labelOverride?: string): void;
}

function renderProgress(steps: string[]): StepHandle {
  root.replaceChildren();
  const list = el(`<ul class="steps" aria-live="polite" aria-label="Report progress"></ul>`);
  const items = steps.map((s) => {
    const li = el(`<li><span class="dot"></span><span class="t">${esc(s)}</span></li>`);
    list.appendChild(li);
    return li;
  });
  root.appendChild(el(`<div class="card"><h3>${esc(t("analyzing"))}</h3></div>`)).appendChild(list);
  return {
    set(index, status, labelOverride) {
      const li = items[index];
      if (!li) return;
      li.className = status === "pending" ? "" : status;
      if (labelOverride) li.querySelector(".t")!.textContent = labelOverride;
    },
  };
}

async function openFullReport(id?: string): Promise<void> {
  try {
    if (!id && state.analysis) {
      // Read the saved report by stable ID; only unsaved results need a local snapshot.
      if (!state.savedReportId) {
        const saved = await saveReport({ analysis: state.analysis, qa: state.qa, managedReportId: state.managedReportId });
        state.savedReportId = saved.id;
        await refreshReportLibrary();
      }
      id = state.savedReportId;
    }
    if (!id) throw new Error(t("reportNotFound"));
    const path = `reader.html?id=${encodeURIComponent(id)}`;
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) await chrome.tabs.create({ url: chrome.runtime.getURL(path) });
    else window.open(new URL(path, location.href), "_blank", "noopener");
  } catch (error) {
    state.error = error instanceof Error ? error.message : t("reportNotFound");
    render();
  }
}

function renderResults(): void {
  const a = state.analysis!;
  if (a.recipe || a.procedure || a.lesson) ensureReportStyles();

  const back = el(`<button class="back-link">${esc(t("newAnalysis"))}</button>`);
  back.addEventListener("click", () => {
    state.analysis = null;
    state.qa = [];
    state.savedReportId = null;
    state.managedReportId = null;
    state.view = "home";
    state.error = null;
    render();
  });
  root.appendChild(back);

  root.appendChild(
    el(
      `<div class="meta-line"><b>${esc(a.source.title ?? t("untitledVideo"))}</b><br>` +
        `${esc(modeLabel(a.mode))} · ${a.source.durationSeconds ? fmtTs(a.source.durationSeconds) : "?"} · ` +
        `${esc(t("overallConfidence"))} <span class="conf ${a.confidence}">${esc(confidenceLabel(a.confidence))}</span></div>`,
    ),
  );

  const reportActions = el(`<div class="report-actions"></div>`);
  const fullBtn = el(`<button class="btn btn-primary report-primary full-report">${esc(readerCopy.open)} ↗</button>`);
  fullBtn.addEventListener("click", () => void openFullReport(state.savedReportId ?? undefined));
  const printBtn = el(`<button class="btn btn-primary report-primary">${esc(t("printPdf"))}</button>`);
  const htmlBtn = el(`<button class="btn btn-secondary report-primary">${esc(t("downloadHtml"))}</button>`);
  printBtn.addEventListener("click", () => {
    if (!printHtmlReport(a, state.qa)) {
      download(reportFilename(a, "html"), toHtmlReport(a, state.qa), "text/html");
      state.error = t("printBlocked");
      render();
    }
  });
  htmlBtn.addEventListener("click", () =>
    download(reportFilename(a, "html"), toHtmlReport(a, state.qa), "text/html"),
  );
  reportActions.append(fullBtn, printBtn, htmlBtn);
  root.appendChild(reportActions);

  const exportRow = el(`<div class="export-row secondary-exports"></div>`);
  const mdBtn = el(`<button class="btn btn-ghost btn-sm">${esc(t("markdown"))}</button>`);
  const jsonBtn = el(`<button class="btn btn-ghost btn-sm">${esc(t("json"))}</button>`);
  const copyBtn = el(`<button class="btn btn-ghost btn-sm">${esc(t("copyText"))}</button>`);
  mdBtn.addEventListener("click", () => download(reportFilename(a, "md"), toMarkdown(a, state.qa), "text/markdown"));
  jsonBtn.addEventListener("click", () =>
    download(reportFilename(a, "json"), JSON.stringify({ ...a, qa: state.qa }, null, 2), "application/json"),
  );
  copyBtn.addEventListener("click", () => void navigator.clipboard.writeText(toMarkdown(a, state.qa)).then(() => {
    copyBtn.textContent = t("copied");
  }));
  exportRow.append(mdBtn, jsonBtn, copyBtn);
  if (a.procedure) {
    const checklistBtn = el(`<button class="btn btn-ghost btn-sm">${esc(t("copyText"))} · ${esc(procedureCopy(documentLanguage()).checklist)}</button>`);
    checklistBtn.addEventListener("click", () => {
      const text = procedureChecklist(a.procedure, a.outputLanguage);
      void navigator.clipboard.writeText(text).then(() => {
        checklistBtn.textContent = t("copied");
      }).catch(() => download(reportFilename(a, "checklist.md"), text, "text/markdown"));
    });
    exportRow.append(checklistBtn);
  }
  root.appendChild(exportRow);

  const summary = el(
    `<section class="card report-section summary-card"><h3>${esc(t("executiveSummary"))}</h3>` +
      `<div class="summary-prose">${renderProse(a.summary, t("none"))}</div></section>`,
  );
  root.appendChild(summary);
  if (a.lesson) {
    const card = el(lessonHtml(a.lesson, a.outputLanguage, a.source.url, a.source.durationSeconds));
    root.appendChild(card);
    bindLessonStudy(card, a.lesson, `local:${state.savedReportId || a.source.url || a.source.title || "draft"}`, a.outputLanguage, a.source.url);
  }
  if (a.procedure) root.appendChild(el(procedureHtml(a.procedure, a.outputLanguage, a.source.url, a.source.durationSeconds)));
  if (a.recipe) root.appendChild(el(recipeHtml(a.recipe, a.outputLanguage, a.source.url, a.source.durationSeconds)));

  if (a.findings.length > 0) {
    const card = el(`<section class="card report-section findings-card"><h3>${esc(t("keyFindings"))}</h3></section>`);
    for (const [index, f] of a.findings.entries()) {
      const div = el(
        `<article class="finding">` +
          `<div class="finding-head"><span class="finding-index" aria-hidden="true">${index + 1}</span>` +
          `<div class="f-text">${esc(f.finding)}<span class="conf ${f.confidence}">${esc(confidenceLabel(f.confidence))}</span></div></div>` +
          `<div class="evidence-list"></div></article>`,
      );
      const evidenceList = div.querySelector(".evidence-list")!;
      for (const e of f.evidence) {
        evidenceList.appendChild(
          el(`<div class="evidence"><span class="ts">${fmtTs(e.timestamp)}</span><span class="evidence-text">${esc(e.detail)}</span></div>`),
        );
      }
      card.appendChild(div);
    }
    root.appendChild(card);
  }

  if (a.recommendations.length > 0) {
    const card = el(`<section class="card report-section"><h3>${esc(t("recommendations"))}</h3><ol class="recs"></ol></section>`);
    const ol = card.querySelector("ol")!;
    for (const r of a.recommendations) {
      ol.appendChild(
        el(
          `<li>${esc(r.recommendation)}<span class="conf ${r.confidence}">${esc(confidenceLabel(r.confidence))}</span>` +
            (r.rationale ? `<div class="rationale">${esc(r.rationale)}</div>` : "") +
            `</li>`,
        ),
      );
    }
    root.appendChild(card);
  }

  if (a.tasks.length > 0) {
    const card = el(`<section class="card report-section"><h3>${esc(t("actionItems"))}</h3><ul class="tasks"></ul></section>`);
    const ul = card.querySelector("ul")!;
    for (const t of a.tasks) {
      ul.appendChild(el(`<li>${esc(t.title)}${t.detail ? `<div class="rationale">${esc(t.detail)}</div>` : ""}</li>`));
    }
    root.appendChild(card);
  }

  if (a.limitations.length > 0) {
    const card = el(`<section class="card report-section"><h3>${esc(t("limitations"))}</h3><ul class="limits"></ul></section>`);
    const ul = card.querySelector("ul")!;
    for (const lim of a.limitations) ul.appendChild(el(`<li>${esc(lim)}</li>`));
    root.appendChild(card);
  }

  if (needsManagedContinuation(state.proEntitlement, state.managedReportId)) {
    const continuation = el(`<section class="card managed-continuation"><h3>Your starter report is ready</h3><p>Create more reports, lessons, and guides with Pro. Get 20 reports per calendar month for $12/month or $99/year. No API key required. Cancel anytime.</p><p class="hint">Your report stays in this browser’s Library while you visit checkout.</p><button class="btn btn-primary" id="continue-managed">Continue with Pro</button><button class="btn btn-ghost" id="continue-private">Use my own key</button></section>`);
    continuation.querySelector("#continue-managed")!.addEventListener("click", () => void continueWithManaged());
    continuation.querySelector("#continue-private")!.addEventListener("click", () => { state.view = "settings"; render(); document.querySelector("#private-key-settings")?.setAttribute("open", ""); });
    root.appendChild(continuation);
  }

  // Q&A
  const qaCard = el(`<section class="card report-section qa-card"><h3>${esc(t("askFollowUp"))}</h3></section>`);
  const history = el(`<div></div>`);
  for (const entry of state.qa) {
    history.appendChild(el(`<div class="qa-q">${esc(t("questionPrefix"))} ${esc(entry.question)}</div>`));
    history.appendChild(el(`<div class="qa-answer">${mdLite(entry.answer)}</div>`));
  }
  const qaRow = el(`<div class="row" style="margin-top:8px"></div>`);
  const qaInput = el(`<input type="text" class="grow" placeholder="${esc(t("followUpPlaceholder"))}">`) as HTMLInputElement;
  const qaBtn = el(`<button class="btn btn-secondary btn-sm">${esc(t("ask"))}</button>`) as HTMLButtonElement;
  const qaStatus = el(`<div class="qa-status" aria-live="polite"></div>`);
  let asking = false;
  const ask = async () => {
    const q = qaInput.value.trim();
    if (!q || asking) return;
    asking = true;
    qaBtn.disabled = true;
    qaInput.disabled = true;
    qaBtn.textContent = t("asking");
    qaStatus.replaceChildren();
    try {
      let access: AiAccess;
      if (state.managedReportId && state.proSession) {
        access = { kind: "pro", token: state.proSession.token, reportId: state.managedReportId };
      } else {
        const apiKey = await getApiKey();
        if (!apiKey) {
          state.error = t("apiKeySettingsFirst");
          state.view = "settings";
          render();
          return;
        }
        access = { kind: "byok", apiKey };
      }
      const answer = await askQuestion(access, q, a.timeline, a, outputLanguageForAnalysis(a));
      state.qa.push({ question: q, answer });
      await persistCurrentReport();
      render();
    } catch (e) {
      const message = e instanceof Error ? localizeKnownError(e.message) : t("followUpFailed");
      qaStatus.replaceChildren(el(`<div class="banner error">${esc(message)}</div>`));
      qaInput.disabled = false;
      qaBtn.disabled = false;
      qaBtn.textContent = t("ask");
      qaInput.focus();
    } finally {
      asking = false;
    }
  };
  qaBtn.addEventListener("click", () => void ask());
  qaInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void ask();
  });
  qaRow.append(qaInput, qaBtn);
  qaCard.append(history, qaRow, qaStatus);
  root.appendChild(qaCard);

  if (state.error) root.prepend(el(`<div class="banner error">${esc(state.error)}</div>`));
  state.error = null;
}

function renderSettings(): void {
  const back = el(`<button class="back-link">${esc(t("back"))}</button>`);
  back.addEventListener("click", () => {
    state.view = state.analysis ? "results" : "home";
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
        `<div class="card pro-account-card"><div class="account-heading"><div><h3>${esc(t("account"))}</h3><b>${esc(state.proSession.email)}</b></div><span class="plan-pill">${entitlement?.plan === "pro" ? "PRO" : esc(t("free"))}</span></div>
          <p class="hint">${entitlement ? esc(t("reportsRemaining", { remaining: entitlement.managedReportsRemaining, limit: entitlement.managedReportsLimit })) : esc(t("checkingAllowance"))}</p>
          <div class="settings-actions"><button class="btn btn-primary btn-sm" id="use-pro">${esc(t("useManaged"))}</button><button class="btn btn-secondary btn-sm" id="manage-account">${esc(t("accountBilling"))}</button><button class="btn btn-ghost btn-sm" id="disconnect-pro">${esc(t("disconnect"))}</button></div>
          <label class="cloud-toggle"><input type="checkbox" id="cloud-save" ${cloudLibraryEnabled ? "checked" : ""}><span><b>${esc(cloudCopy("title"))}</b><small>${esc(cloudCopy("help"))}</small></span></label>
          <button class="btn btn-secondary btn-sm" id="upload-library" ${cloudUploadBusy ? "disabled" : ""}>${esc(cloudCopy("upload"))}</button>
          <p class="hint" id="cloud-upload-status" role="status" aria-live="polite">${esc(cloudUploadNotice)}</p>
        </div>`,
      )
    : el(
        `<div class="card pro-account-card"><div class="account-heading"><div><h3>${esc(t("account"))}</h3><b>${esc(t("noApiKey"))}</b></div><span class="plan-pill">${esc(t("free"))}</span></div>
          <p class="hint">${esc(t("proOffer"))}</p>
          <button class="btn btn-primary" id="connect-pro">${esc(t("connectAccount"))}</button>
          <p class="hint" style="margin-bottom:0">${esc(t("accountSecurity"))}</p>
        </div>`,
      );
  root.appendChild(accountCard);

  if (state.proSession) {
    accountCard.querySelector("#use-pro")!.addEventListener("click", () => void chooseProvider("pro", true));
    accountCard.querySelector("#manage-account")!.addEventListener("click", openProAccount);
    accountCard.querySelector("#disconnect-pro")!.addEventListener("click", async () => {
      cloudUploadCancelled = true;
      cloudLibraryEnabled = false;
      cloudUploadNotice = "";
      await disconnectPro();
      state.proSession = null;
      state.proEntitlement = null;
      state.analysisProvider = "byok";
      await setAnalysisProvider("byok");
      render();
    });
    accountCard.querySelector<HTMLInputElement>("#cloud-save")!.addEventListener("change", async (event) => {
      const input = event.currentTarget as HTMLInputElement;
      input.disabled = true;
      try {
        await setCloudLibraryEnabled(input.checked);
        cloudLibraryEnabled = input.checked;
        state.proCloudSave = input.checked;
        if (input.checked) await uploadExistingLibrary();
        else cloudUploadCancelled = true;
      } catch { cloudUploadNotice = cloudCopy("failed"); input.checked = cloudLibraryEnabled; }
      finally { input.disabled = false; updateCloudUploadStatus(); }
    });
    accountCard.querySelector("#upload-library")!.addEventListener("click", () => void uploadExistingLibrary());
  } else {
    const connectButton = accountCard.querySelector<HTMLButtonElement>("#connect-pro")!;
    connectButton.addEventListener("click", async () => {
      connectButton.disabled = true;
      connectButton.textContent = t("waitingApproval");
      try {
        state.proSession = await startProConnection();
    cloudLibraryEnabled = await getCloudLibraryEnabled();
        state.proEntitlement = await fetchProEntitlement(state.proSession.token);
        state.analysisProvider = "pro";
        await setAnalysisProvider("pro");
        state.error = null;
        render();
      } catch (error) {
        state.error = localizeKnownError((error as Error).message);
        connectButton.disabled = false;
        connectButton.textContent = t("connectAccount");
        render();
      }
    });
  }

  // OpenAI key
  const keyCard = el(
    `<details class="card private-access" id="private-key-settings" ${state.analysisProvider === "byok" ? "open" : ""}><summary>${esc(t("privateApiKey"))}</summary>
      <div class="row"><input type="password" class="grow" id="api-key" placeholder="sk-...">
      <button class="btn btn-secondary btn-sm" id="save-key">${esc(t("save"))}</button></div>
      <p class="hint">${esc(t("keyHelpBefore"))} <a href="${LINKS.openaiKeys}" target="_blank">${esc(t("getKey"))}</a></p>
      <div id="key-status"></div><button class="btn btn-secondary btn-sm" id="use-private-key">${esc(t("usePrivateAccess"))}</button></details>`,
  );
  root.appendChild(keyCard);
  keyCard.querySelector("#use-private-key")!.addEventListener("click", () => void chooseProvider("byok", true));
  const keyInput = keyCard.querySelector<HTMLInputElement>("#api-key")!;
  const keyStatus = keyCard.querySelector<HTMLElement>("#key-status")!;
  if (hasExtensionStorage) {
    void getApiKey().then((k) => {
      if (k) {
        keyInput.value = k;
        keyStatus.replaceChildren(el(`<div class="banner ok" style="margin:8px 0 0">${esc(t("keySaved"))}</div>`));
      }
    });
  }
  keyCard.querySelector("#save-key")!.addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (!key) {
      await setApiKey(null);
      state.privateAccessReady = false;
      keyStatus.replaceChildren(el(`<div class="banner trial" style="margin:8px 0 0">${esc(t("keyRemoved"))}</div>`));
      return;
    }
    keyStatus.replaceChildren(el(`<div class="banner trial" style="margin:8px 0 0">${esc(t("checkingKey"))}</div>`));
    const ok = await verifyApiKey(key).catch(() => false);
    if (!ok) {
      keyStatus.replaceChildren(el(`<div class="banner error" style="margin:8px 0 0">${esc(t("keyRejected"))}</div>`));
      return;
    }
    await setApiKey(key);
    await setAnalysisProvider("byok");
    state.analysisProvider = "byok";
    state.privateAccessReady = true;
    keyStatus.replaceChildren(el(`<div class="banner ok" style="margin:8px 0 0">${esc(t("keyVerified"))}</div>`));
  });

  const privacyCard = el(
    `<div class="card"><h3>${esc(t("privacyData"))}</h3>
      <p class="hint" style="margin:0 0 8px">${esc(t("privacyReviewHelp"))}</p>
      <button class="btn btn-secondary btn-sm" id="review-privacy">${esc(t("reviewDisclosure"))}</button>
      <a class="btn btn-ghost btn-sm" href="${LINKS.privacy}" target="_blank">${esc(t("fullPrivacyPolicy"))}</a>
    </div>`,
  );
  root.appendChild(privacyCard);
  privacyCard.querySelector("#review-privacy")!.addEventListener("click", async () => {
    await resetPrivacyDisclosure();
    state.privacyDisclosureAccepted = false;
    state.view = "home";
    render();
  });

  root.appendChild(
    el(
      `<p class="hint" style="text-align:center">${esc(t("openSource"))} · <a href="${LINKS.github}" target="_blank">GitHub</a> · <a href="${LINKS.privacy}" target="_blank">${esc(t("privacy"))}</a> · <a href="${LINKS.site}" target="_blank">videolens.io</a></p>`,
    ),
  );
}

// ── pipeline run ────────────────────────────────────────────────────────────

async function runAnalysis(): Promise<void> {
  if (analysisInFlight) return;
  analysisInFlight = true;
  try { await performAnalysis(); }
  finally { analysisInFlight = false; }
}

async function performAnalysis(): Promise<void> {
  state.error = null;

  if (!isProviderReady(state.analysisProvider)) {
    state.view = "accessSetup";
    render();
    return;
  }

  if (state.sourceKind === "file" && !state.localVideo) {
    state.error = t("chooseVideoFirst");
    state.view = "home";
    render();
    return;
  }

  if (state.sourceKind === "tab") {
    try {
      // Keep this as the first asynchronous operation from the Analyze click:
      // Browsers only allow optional permissions to be requested from a direct
      // user gesture.
      await ensureTabCapturePermission();
    } catch (error) {
      state.error = localizeKnownError((error as Error).message);
      state.view = "reportSetup";
      render();
      return;
    }
  }

  const prompt = state.prompt.trim() || modeDefaultPrompt(state.mode);
  let access: AiAccess;
  let managedReportId: string | null = null;

  if (state.analysisProvider === "pro") {
    if (!state.proSession) {
      state.error = t("connectFirst");
      state.view = "accessSetup";
      render();
      return;
    }
    try {
      const reservation = await reserveManagedReport(state.proSession.token, state.proCloudSave);
      managedReportId = reservation.reportId;
      state.managedReportId = managedReportId;
      access = { kind: "pro", token: state.proSession.token, reportId: managedReportId };
    } catch (error) {
      state.error = localizeKnownError((error as Error).message);
      state.proEntitlement = await fetchProEntitlement(state.proSession.token).catch(() => state.proEntitlement);
      state.view = "accessSetup";
      render();
      return;
    }
  } else {
    const apiKey = await getApiKey();
    if (!apiKey) {
      state.privateAccessReady = false;
      state.error = t("addKeyFirst");
      state.view = "accessSetup";
      render();
      return;
    }
    state.managedReportId = null;
    access = { kind: "byok", apiKey };
  }

  try {
    state.savedReportId = null;
    state.analysis = null;
    state.qa = [];
    state.view = "progress";
    libraryButton.disabled = true;
    settingsButton.disabled = true;
    if (state.sourceKind === "tab") {
      await runTabAnalysis(access, prompt);
    } else {
      await runFileAnalysis(access, prompt);
    }
    state.qa = [];
    state.hasCompletedFirstReport = true;
    await persistCurrentReport(true);
    if (hasExtensionStorage) void markFirstReportCompleted().catch((error) => console.error("first-report state:", error));
    if (managedReportId && state.proSession) {
      try {
        await completeManagedReport(
          state.proSession.token,
          managedReportId,
          state.analysis,
          state.proCloudSave,
        );
      } catch (completionError) {
        state.error = t("cloudUpdateFailed", { message: (completionError as Error).message });
      }
      state.proEntitlement = await fetchProEntitlement(state.proSession.token).catch(() => state.proEntitlement);
    }
    await persistCurrentReport();
    state.view = "results";
  } catch (e) {
    const code = failureCode(e);
    let allowanceMessage = "";
    if (managedReportId && state.proSession) {
      try {
        await completeManagedReport(state.proSession.token, managedReportId, null, false, true);
        allowanceMessage = " Your managed allowance has been restored.";
      } catch { allowanceMessage = " We could not confirm allowance recovery. Refresh account access before retrying."; }
      state.proEntitlement = await fetchProEntitlement(state.proSession.token).catch(() => state.proEntitlement);
    }
    state.error = `${localizeKnownError((e as Error).message)} ${recoveryHint(code)}${allowanceMessage}`;
    state.view = "reportSetup";
  }
  render();
}

async function runTabAnalysis(access: AiAccess, prompt: string): Promise<void> {
  const steps = renderProgress([
    t("findingVideo"),
    t("fetchingCaptions"),
    t("capturingFrames"),
    t("describingFrames"),
    t("buildingTimeline"),
    t("synthesizing"),
  ]);

  steps.set(0, "active");
  const tabId = await getActiveTabId();
  const probe = await probeTabVideo(tabId);
  if (state.mode === "tutorial" && !probe.isYouTube) throw new Error(procedureCopy(documentLanguage()).unsupported);
  if (state.mode === "recipe" && !probe.isYouTube) throw new Error("Recipe preview currently supports YouTube videos and local video files.");
  steps.set(0, "done", t("foundVideo", { duration: fmtTs(probe.duration) }));

  steps.set(1, "active");
  let transcript: Transcript | null = null;
  if (probe.isYouTube) {
    const captionLanguage = resolveReportLanguage(state.reportLanguage, browserLanguage);
    transcript = await fetchYouTubeCaptions(tabId, captionLanguage === "source" ? null : captionLanguage);
    steps.set(
      1,
      "done",
      transcript
        ? transcript.language
          ? t("captionsCount", { count: transcript.segments.length, language: transcript.language })
          : t("captionsCountNoLanguage", { count: transcript.segments.length })
        : t("noCaptions"),
    );
  } else {
    steps.set(1, "done", t("captionsUnavailable"));
  }

  steps.set(2, "active");
  const maxFrames = state.analysisProvider === "pro" ? Math.min(state.setupMaxFrames, 40) : state.setupMaxFrames;
  const timestamps = state.mode === "recipe" ? recipeFrameTimestamps(probe.duration) : state.mode === "tutorial" ? procedureFrameTimestamps(probe.duration, transcript) : planFrameTimestamps(probe.duration, maxFrames, DEFAULTS.frameIntervalSeconds);
  const frames = await captureTabFrames(tabId, timestamps, DEFAULTS.frameJpegQuality, DEFAULTS.maxFrameEdgePx);
  steps.set(2, "done", t("capturedFrames", { count: frames.length }));

  const source = makeTabSource(probe, transcript !== null);
  if (state.mode === "recipe" && frames.length !== timestamps.length) {
    if (!frames.length) throw new Error("No cooking frames could be captured. Please retry with a YouTube video or local file.");
    source.limitations.push(`Only ${frames.length} of ${timestamps.length} planned recipe frames were captured; some cooking details may be missing.`);
  }
  if (state.mode === "tutorial" && frames.length < timestamps.length) source.limitations.push(`${timestamps.length - frames.length} planned procedure frames could not be captured.`);
  const creatorText = state.mode === "recipe" ? await fetchRecipeCreatorText(tabId).catch(() => "") : "";
  const recipeContext: RecipeContext = { creatorText, sources: creatorText ? [{ id: "creator-description", title: "Creator description", url: probe.pageUrl, kind: "creator" }] : [], researchText: "", research: "not_requested" };
  const outputLanguage = resolveReportLanguage(state.reportLanguage, browserLanguage, transcript?.language);
  await describeAndSynthesize(access, steps, frames, transcript, probe.duration, source, prompt, outputLanguage, 3, recipeContext);
}

async function runFileAnalysis(access: AiAccess, prompt: string): Promise<void> {
  const local = state.localVideo!;
  const frameStep = state.mode === "tutorial" ? 1 : 0;
  const transcriptStep = state.mode === "tutorial" ? 0 : 1;
  const steps = renderProgress([
    ...(state.mode === "tutorial" ? [t("transcribingAudio"), t("samplingFrames")] : [t("samplingFrames"), t("transcribingAudio")]),
    t("describingFrames"),
    t("buildingTimeline"),
    t("synthesizing"),
  ]);

  let earlyTranscript: Awaited<ReturnType<typeof transcribeLocalFile>> | null = null;
  if (state.mode === "tutorial") {
    steps.set(transcriptStep, "active");
    earlyTranscript = await transcribeLocalFile(access, local, (done, total) => steps.set(transcriptStep, "active", t("transcribingProgress", { done, total })));
    steps.set(transcriptStep, "done", earlyTranscript.transcript ? t("transcribedChunks", { count: earlyTranscript.transcript.segments.length }) : t("audioSkipped"));
  }
  steps.set(frameStep, "active");
  const maxFrames = state.analysisProvider === "pro" ? Math.min(state.setupMaxFrames, 40) : state.setupMaxFrames;
  const timestamps = state.mode === "recipe" ? recipeFrameTimestamps(local.duration) : state.mode === "tutorial" ? procedureFrameTimestamps(local.duration, earlyTranscript?.transcript) : planFrameTimestamps(local.duration, maxFrames, DEFAULTS.frameIntervalSeconds);
  const frames = await captureLocalFrames(local, timestamps, (done, total) =>
    steps.set(frameStep, "active", t("samplingProgress", { done, total })),
  );
  steps.set(frameStep, "done", t("sampledFrames", { count: frames.length }));

  if (!earlyTranscript) steps.set(transcriptStep, "active");
  const { transcript, limitation } = earlyTranscript ?? await transcribeLocalFile(access, local, (done, total) =>
    steps.set(transcriptStep, "active", t("transcribingProgress", { done, total })),
  );
  steps.set(transcriptStep, "done", transcript ? t("transcribedChunks", { count: transcript.segments.length }) : t("audioSkipped"));

  const source = makeLocalSource(local, limitation ? [limitation] : []);
  const outputLanguage = resolveReportLanguage(state.reportLanguage, browserLanguage, transcript?.language);
  await describeAndSynthesize(access, steps, frames, transcript, local.duration, source, prompt, outputLanguage, 2);
}

async function describeAndSynthesize(
  access: AiAccess,
  steps: StepHandle,
  frames: CapturedFrame[],
  transcript: Transcript | null,
  duration: number,
  source: Parameters<typeof analyzeTimeline>[2],
  prompt: string,
  outputLanguage: ConcreteReportLanguage | "source",
  stepOffset = 3,
  recipeContext: RecipeContext = { creatorText: "", sources: [], researchText: "", research: "not_requested" },
): Promise<void> {
  steps.set(stepOffset, "active");
  const summaries = await (state.mode === "recipe" ? describeRecipeFrames : state.mode === "tutorial" ? describeProcedureFrames : state.mode === "lesson" ? describeLessonFrames : describeFrames)(access, frames, (done, total) =>
    steps.set(stepOffset, "active", t("describingProgress", { done, total })),
  );
  if (state.mode === "recipe") {
    if (summaries.length < Math.ceil(frames.length / 2)) throw new Error("Too few cooking frames could be analyzed. Please retry the recipe scan.");
    if (summaries.length < frames.length) source.limitations.push(`${frames.length - summaries.length} of ${frames.length} sampled frames could not be analyzed; ingredients or steps may be missing.`);
    if (duration > 60) source.limitations.push(`Recipe sampling was limited to ${frames.length} frames over ${duration.toFixed(1)} seconds; brief ingredients or text may be missed.`);
  }
  if (state.mode === "tutorial") {
    if (!frames.length || summaries.length < Math.ceil(frames.length / 2)) throw new Error(procedureCopy(documentLanguage()).noFrames);
    source.limitations.push(`Procedure evidence uses ${summaries.length} analyzed frames across ${duration.toFixed(1)} seconds. Brief settings and skipped actions may be missing; execution and current software behavior were not verified.`);
    if (summaries.length < frames.length) source.limitations.push(`${frames.length - summaries.length} captured frames could not be analyzed.`);
  }
  if (state.mode === "lesson") {
    if (!summaries.length && !transcript?.segments.some(s => s.text.trim())) throw new Error(lessonCopy(documentLanguage()).noLesson);
    source.limitations.push(`Lesson evidence uses ${summaries.length} analyzed frames across ${duration.toFixed(1)} seconds. Brief diagrams, formulas, and transitions may be missed. Source claims are not independently verified.`);
    if (summaries.length < frames.length) source.limitations.push(`${frames.length - summaries.length} captured frames could not be analyzed.`);
  }
  steps.set(stepOffset, "done", t("describedFrames", { count: summaries.length }));

  steps.set(stepOffset + 1, "active");
  const timeline = buildTimeline(summaries, transcript, duration);
  if (timeline.segments.length === 0) {
    throw new Error(t("nothingExtracted"));
  }
  steps.set(stepOffset + 1, "done", t("timelineSegments", { count: timeline.segments.length }));

  steps.set(stepOffset + 2, "active");
  state.analysis = state.mode === "recipe"
    ? await analyzeRecipeWithResearch(access, timeline, source, prompt, outputLanguage, recipeContext, state.recipeLookup,
      () => steps.set(stepOffset + 2, "active", recipeCopy(documentLanguage()).researching),
      async draft => {
        state.analysis = draft;
        await persistCurrentReport(true);
        if (state.savedReportId) {
          const preview = el('<button class="btn btn-secondary recipe-draft">Read saved recipe while lookup continues ↗</button>');
          preview.addEventListener("click", () => void openFullReport(state.savedReportId!));
          root.appendChild(preview);
        }
      })
    : await analyzeTimeline(access, timeline, source, state.mode, prompt, outputLanguage);
  steps.set(stepOffset + 2, "done");
}

// ── helpers ─────────────────────────────────────────────────────────────────

function el(html: string): HTMLElement {
  const parsed = new window.DOMParser().parseFromString(
    `<!doctype html><html><body>${html.trim()}</body></html>`,
    "text/html",
  );
  return document.importNode(parsed.body.firstElementChild as HTMLElement, true);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderProse(value: string, emptyLabel: string): string {
  const paragraphs = proseParagraphs(value);
  if (paragraphs.length === 0) return `<p><i>${esc(emptyLabel)}</i></p>`;
  return paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("");
}

function proseParagraphs(value: string, targetLength = 340): string[] {
  const normalized = value.trim();
  if (!normalized) return [];

  const authoredParagraphs = normalized.split(/\n+/u).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (authoredParagraphs.length > 1) return authoredParagraphs;

  const sentences = normalized.match(/[^.!?。！？]+(?:[.!?。！？]+[”’"')\]]*|$)/gu)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [normalized];
  if (sentences.length < 2 || normalized.length <= targetLength) return [normalized];

  const paragraphs: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && candidate.length > targetLength) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

function confidenceLabel(confidence: Analysis["confidence"]): string {
  return reportCopy(documentLanguage()).confidenceLabels[confidence];
}

function outputLanguageForAnalysis(analysis: Analysis): ConcreteReportLanguage | "source" {
  if (analysis.outputLanguage === "source") return "source";
  return normalizeLanguageTag(analysis.outputLanguage)
    ?? resolveReportLanguage(state.reportLanguage, browserLanguage);
}

function localizeKnownError(message: string): string {
  const translations: Record<string, UiKey> = {
    "No active tab found.": "noActiveTab",
    "This browser page can't be analyzed. Open a YouTube video and try again.": "chromePageCannotAnalyze",
    "VideoLens needs access to YouTube to analyze this video. Choose Allow when your browser asks, then try again.": "youtubeAccessRequired",
    "VideoLens still can't access this tab. Make sure the YouTube video tab is selected, then try again.": "tabStillUnavailable",
    "No video found on this page. Make sure the video has started loading, then try again.": "noVideoFound",
    "The video on this page has no seekable duration (live streams aren't supported).": "noSeekableDuration",
    "Frame capture failed.": "frameCaptureFailed",
    "This file has no readable duration.": "noReadableDuration",
    "Canvas unavailable.": "canvasUnavailable",
    "Could not open this file as a video (unsupported codec or corrupt file).": "fileOpenFailed",
  };
  const key = translations[message];
  return key ? t(key) : message;
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
