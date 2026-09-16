import { cleanSourceTitle } from "./sourceTitle";
import { normalizeRecipe } from "./recipe";
import { recipeMarkdown } from "./recipeReport";
import type {
  Analysis,
  AnalysisMode,
  Confidence,
  QaEntry,
  SourceType,
} from "./types";

export const REPORT_LIBRARY_DB_NAME = "videolens-report-library";
export const REPORT_LIBRARY_DB_VERSION = 2;
export const REPORT_LIBRARY_EXPORT_VERSION = 1;
export const REPORT_LIBRARY_EXPORT_FORMAT = "videolens-report-library";
export const MAX_LIBRARY_IMPORT_BYTES = 50 * 1024 * 1024;

const REPORTS_STORE = "reports";
const UPDATED_AT_INDEX = "updatedAt";
const REPORT_SCHEMA_VERSION = 1 as const;
const ANALYSIS_MODES = new Set<AnalysisMode>([
  "general", "key_insights", "bug", "meeting", "ux", "tutorial",
  "interview", "product_demo", "content", "privacy", "recipe",
]);
const SOURCE_TYPES = new Set<SourceType>(["tab_video", "youtube", "local_file"]);
const CONFIDENCE_VALUES = new Set<Confidence>(["high", "medium", "low"]);

export class ReportLibraryQuotaError extends Error {
  constructor() {
    super("The local report library is out of storage space.");
    this.name = "ReportLibraryQuotaError";
  }
}

export class ReportLibraryImportError extends Error {
  constructor(message = "This is not a valid VideoLens report-library file.") {
    super(message);
    this.name = "ReportLibraryImportError";
  }
}

export interface SavedReport {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  id: string;
  createdAt: number;
  updatedAt: number;
  analysis: Analysis;
  qa: QaEntry[];
  managedReportId: string | null;
}

export interface SavedReportSummary {
  id: string;
  title: string | null;
  sourceType: Analysis["source"]["sourceType"];
  mode: Analysis["mode"];
  outputLanguage: string | null;
  createdAt: number;
  updatedAt: number;
  qaCount: number;
}

export interface SaveReportInput {
  id?: string | null;
  analysis: Analysis;
  qa: QaEntry[];
  managedReportId?: string | null;
}

export interface LibraryListOptions {
  query?: string;
  limit?: number;
}

export interface LibraryListResult {
  reports: SavedReportSummary[];
  total: number;
  invalid: number;
  latestReportId: string | null;
}

interface PortableSavedReport {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  id: string;
  createdAt: number;
  updatedAt: number;
  analysis: Analysis;
  qa: QaEntry[];
}

interface ReportLibraryExportFile {
  format: typeof REPORT_LIBRARY_EXPORT_FORMAT;
  version: typeof REPORT_LIBRARY_EXPORT_VERSION;
  exportedAt: string;
  reports: PortableSavedReport[];
}

export interface ExportReportLibraryResult {
  json: string;
  reportCount: number;
  excludedInvalid: number;
}

export interface ImportReportLibraryResult {
  imported: number;
  updated: number;
  skipped: number;
  invalid: number;
}

export interface ReportLibraryStorageStatus {
  usage: number;
  quota: number;
  ratio: number;
  persistent: boolean | null;
}

interface LibraryInventory {
  valid: SavedReport[];
  invalid: number;
}

export async function saveReport(input: SaveReportInput): Promise<SavedReport> {
  const db = await openReportLibrary();
  try {
    const transaction = db.transaction(REPORTS_STORE, "readwrite");
    const completed = transactionDone(transaction);
    const store = transaction.objectStore(REPORTS_STORE);
    const existing = input.id
      ? normalizeSavedReport(await requestResult(store.get(input.id)))
      : null;
    const timestamp = Date.now();
    const report: SavedReport = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      id: existing?.id ?? input.id ?? createReportId(),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      analysis: input.analysis,
      qa: input.qa.map((entry) => ({ ...entry })),
      managedReportId: input.managedReportId ?? existing?.managedReportId ?? null,
    };
    store.put(report);
    await completed;
    return report;
  } catch (error) {
    throw normalizeStorageError(error);
  } finally {
    db.close();
  }
}

export async function getSavedReport(id: string): Promise<SavedReport | null> {
  const db = await openReportLibrary();
  try {
    const transaction = db.transaction(REPORTS_STORE, "readonly");
    const completed = transactionDone(transaction);
    const value = await requestResult(transaction.objectStore(REPORTS_STORE).get(id));
    await completed;
    return normalizeSavedReport(value);
  } finally {
    db.close();
  }
}

export async function listSavedReports(options: LibraryListOptions = {}): Promise<LibraryListResult> {
  const inventory = await readInventory();
  const sorted = inventory.valid.sort((a, b) => b.updatedAt - a.updatedAt);
  const latestReportId = sorted[0]?.id ?? null;
  const tokens = normalizeSearch(options.query ?? "").split(/\s+/).filter(Boolean);
  const matching = tokens.length === 0
    ? sorted
    : sorted.filter((report) => {
        const searchable = searchableReportText(report);
        return tokens.every((token) => searchable.includes(token));
      });
  const limit = normalizedLimit(options.limit, matching.length);
  return {
    reports: matching.slice(0, limit).map(toSummary),
    total: sorted.length,
    invalid: inventory.invalid,
    latestReportId,
  };
}

export async function listRecentReports(limit = 8): Promise<SavedReportSummary[]> {
  return (await listSavedReports({ limit })).reports;
}

export async function countSavedReports(): Promise<number> {
  return (await listSavedReports({ limit: 0 })).total;
}

export async function deleteSavedReport(id: string): Promise<void> {
  const db = await openReportLibrary();
  try {
    const transaction = db.transaction(REPORTS_STORE, "readwrite");
    const completed = transactionDone(transaction);
    transaction.objectStore(REPORTS_STORE).delete(id);
    await completed;
  } finally {
    db.close();
  }
}

export async function clearReportLibrary(): Promise<void> {
  const db = await openReportLibrary();
  try {
    const transaction = db.transaction(REPORTS_STORE, "readwrite");
    const completed = transactionDone(transaction);
    transaction.objectStore(REPORTS_STORE).clear();
    await completed;
  } finally {
    db.close();
  }
}

export async function exportReportLibrary(): Promise<ExportReportLibraryResult> {
  const inventory = await readInventory();
  const reports = inventory.valid
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ managedReportId: _managedReportId, ...report }) => report);
  const data: ReportLibraryExportFile = {
    format: REPORT_LIBRARY_EXPORT_FORMAT,
    version: REPORT_LIBRARY_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    reports,
  };
  return {
    json: JSON.stringify(data, null, 2),
    reportCount: reports.length,
    excludedInvalid: inventory.invalid,
  };
}

export async function importReportLibrary(json: string): Promise<ImportReportLibraryResult> {
  if (new TextEncoder().encode(json).byteLength > MAX_LIBRARY_IMPORT_BYTES) {
    throw new ReportLibraryImportError("The VideoLens report-library file is too large to import safely.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ReportLibraryImportError();
  }
  if (!isObject(parsed)
    || parsed.format !== REPORT_LIBRARY_EXPORT_FORMAT
    || parsed.version !== REPORT_LIBRARY_EXPORT_VERSION
    || !Array.isArray(parsed.reports)) {
    throw new ReportLibraryImportError();
  }

  const importedById = new Map<string, SavedReport>();
  let invalid = 0;
  let skipped = 0;
  for (const value of parsed.reports) {
    const report = normalizePortableReport(value);
    if (!report) {
      invalid += 1;
      continue;
    }
    const duplicate = importedById.get(report.id);
    if (duplicate) {
      skipped += 1;
      if (report.updatedAt > duplicate.updatedAt) importedById.set(report.id, report);
    } else {
      importedById.set(report.id, report);
    }
  }

  const existing = await readInventory();
  const existingById = new Map(existing.valid.map((report) => [report.id, report]));
  const toWrite: SavedReport[] = [];
  let imported = 0;
  let updated = 0;
  for (const report of importedById.values()) {
    const current = existingById.get(report.id);
    if (!current) {
      imported += 1;
      toWrite.push(report);
    } else if (report.updatedAt > current.updatedAt) {
      updated += 1;
      toWrite.push({ ...report, createdAt: Math.min(report.createdAt, current.createdAt) });
    } else {
      skipped += 1;
    }
  }

  if (toWrite.length > 0) await writeReportsAtomically(toWrite);
  return { imported, updated, skipped, invalid };
}

export async function getReportLibraryStorageStatus(): Promise<ReportLibraryStorageStatus | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const [estimate, persistent] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted?.().catch(() => false) ?? Promise.resolve(null),
    ]);
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) return null;
    return { usage, quota, ratio: usage / quota, persistent };
  } catch {
    return null;
  }
}

export async function ensurePersistentReportStorage(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

async function readInventory(): Promise<LibraryInventory> {
  const db = await openReportLibrary();
  try {
    const transaction = db.transaction(REPORTS_STORE, "readonly");
    const completed = transactionDone(transaction);
    const values = await requestResult(transaction.objectStore(REPORTS_STORE).getAll());
    await completed;
    const valid: SavedReport[] = [];
    let invalid = 0;
    for (const value of values) {
      const report = normalizeSavedReport(value);
      if (report) valid.push(report);
      else invalid += 1;
    }
    return { valid, invalid };
  } finally {
    db.close();
  }
}

async function writeReportsAtomically(reports: SavedReport[]): Promise<void> {
  const db = await openReportLibrary();
  try {
    const transaction = db.transaction(REPORTS_STORE, "readwrite");
    const completed = transactionDone(transaction);
    const store = transaction.objectStore(REPORTS_STORE);
    for (const report of reports) store.put(report);
    await completed;
  } catch (error) {
    throw normalizeStorageError(error);
  } finally {
    db.close();
  }
}

function openReportLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REPORT_LIBRARY_DB_NAME, REPORT_LIBRARY_DB_VERSION);
    let blocked = false;

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(REPORTS_STORE)
        ? request.transaction!.objectStore(REPORTS_STORE)
        : db.createObjectStore(REPORTS_STORE, { keyPath: "id" });
      if (!store.indexNames.contains(UPDATED_AT_INDEX)) {
        store.createIndex(UPDATED_AT_INDEX, UPDATED_AT_INDEX, { unique: false });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open the local report library."));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("The local report library is busy. Close other VideoLens panels and try again."));
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("A local report library request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("A local report library transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("A local report library transaction was cancelled."));
  });
}

function normalizePortableReport(value: unknown): SavedReport | null {
  if (!isObject(value)) return null;
  return normalizeSavedReport({ ...value, managedReportId: null });
}

function normalizeSavedReport(value: unknown): SavedReport | null {
  if (!isObject(value)
    || value.schemaVersion !== REPORT_SCHEMA_VERSION
    || typeof value.id !== "string"
    || value.id.length === 0
    || !isFiniteTimestamp(value.createdAt)
    || !isFiniteTimestamp(value.updatedAt)
    || !isAnalysis(value.analysis)
    || !Array.isArray(value.qa)
    || !value.qa.every(isQaEntry)
    || !(value.managedReportId == null || typeof value.managedReportId === "string")) {
    return null;
  }
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    id: value.id,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    analysis: {
      ...value.analysis,
      ...(value.analysis.recipe ? { recipe: normalizeRecipe(value.analysis.recipe, value.analysis.source.durationSeconds) } : {}),
      source: { ...value.analysis.source, title: cleanSourceTitle(value.analysis.source.title, value.analysis.source.sourceType) },
    },
    qa: value.qa.map((entry) => ({ ...entry })),
    managedReportId: typeof value.managedReportId === "string" ? value.managedReportId : null,
  };
}

function isAnalysis(value: unknown): value is Analysis {
  if (!isObject(value) || !isObject(value.source) || !isObject(value.timeline)) return false;
  const source = value.source;
  if ((value.mode === "recipe" || value.recipe != null) && !normalizeRecipe(value.recipe, typeof source.durationSeconds === "number" ? source.durationSeconds : null)) return false;
  if (!SOURCE_TYPES.has(source.sourceType as SourceType)
    || !(source.title == null || typeof source.title === "string")
    || !(source.url == null || typeof source.url === "string")
    || !(source.durationSeconds == null || isFiniteNumber(source.durationSeconds))
    || !isStringArray(source.limitations)
    || !ANALYSIS_MODES.has(value.mode as AnalysisMode)
    || !(value.outputLanguage == null || typeof value.outputLanguage === "string")
    || typeof value.prompt !== "string"
    || typeof value.summary !== "string"
    || !Array.isArray(value.timeline.segments)
    || !value.timeline.segments.every((segment) => isObject(segment)
      && isFiniteNumber(segment.start)
      && isFiniteNumber(segment.end)
      && (segment.sceneType == null || typeof segment.sceneType === "string")
      && (segment.transcript == null || typeof segment.transcript === "string")
      && isStringArray(segment.ocr)
      && (segment.visualSummary == null || typeof segment.visualSummary === "string")
      && CONFIDENCE_VALUES.has(segment.confidence as Confidence))
    || !Array.isArray(value.findings)
    || !value.findings.every((finding) => isObject(finding)
      && typeof finding.finding === "string"
      && CONFIDENCE_VALUES.has(finding.confidence as Confidence)
      && Array.isArray(finding.evidence)
      && finding.evidence.every((evidence) => isObject(evidence)
        && isFiniteNumber(evidence.timestamp)
        && typeof evidence.detail === "string"))
    || !Array.isArray(value.recommendations)
    || !value.recommendations.every((recommendation) => isObject(recommendation)
      && typeof recommendation.recommendation === "string"
      && (recommendation.rationale == null || typeof recommendation.rationale === "string")
      && CONFIDENCE_VALUES.has(recommendation.confidence as Confidence))
    || !Array.isArray(value.tasks)
    || !value.tasks.every((task) => isObject(task)
      && typeof task.title === "string"
      && (task.detail == null || typeof task.detail === "string"))
    || !isStringArray(value.limitations)
    || !CONFIDENCE_VALUES.has(value.confidence as Confidence)) {
    return false;
  }
  return true;
}

function isQaEntry(value: unknown): value is QaEntry {
  return isObject(value) && typeof value.question === "string" && typeof value.answer === "string";
}

function toSummary(report: SavedReport): SavedReportSummary {
  return {
    id: report.id,
    title: report.analysis.source.title,
    sourceType: report.analysis.source.sourceType,
    mode: report.analysis.mode,
    outputLanguage: report.analysis.outputLanguage ?? null,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    qaCount: report.qa.length,
  };
}

function searchableReportText(report: SavedReport): string {
  const analysis = report.analysis;
  return normalizeSearch([
    analysis.source.title,
    analysis.source.url,
    analysis.mode,
    analysis.outputLanguage,
    analysis.prompt,
    analysis.summary,
    analysis.recipe ? recipeMarkdown(analysis.recipe, analysis.outputLanguage) : "",
    ...analysis.timeline.segments.flatMap((segment) => [
      segment.sceneType,
      segment.transcript,
      segment.visualSummary,
      ...segment.ocr,
    ]),
    ...analysis.findings.flatMap((finding) => [
      finding.finding,
      ...finding.evidence.map((evidence) => evidence.detail),
    ]),
    ...analysis.recommendations.flatMap((recommendation) => [
      recommendation.recommendation,
      recommendation.rationale,
    ]),
    ...analysis.tasks.flatMap((task) => [task.title, task.detail]),
    ...analysis.limitations,
    ...report.qa.flatMap((entry) => [entry.question, entry.answer]),
  ].filter((value): value is string => typeof value === "string").join("\n"));
}

function normalizeSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function normalizedLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined) return fallback;
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(0, Math.floor(limit));
}

function normalizeStorageError(error: unknown): unknown {
  if (isQuotaExceededError(error)) return new ReportLibraryQuotaError();
  return error;
}

function isQuotaExceededError(error: unknown): boolean {
  return isObject(error) && (
    error.name === "QuotaExceededError"
    || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || error.code === 22
    || error.code === 1014
  );
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteTimestamp(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function createReportId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
