import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { build } from "esbuild";
import { IDBObjectStore, indexedDB } from "fake-indexeddb";

globalThis.indexedDB = indexedDB;

const bundle = await build({
  entryPoints: ["src/lib/reportLibrary.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const source = bundle.outputFiles[0].text;
const library = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

beforeEach(async () => {
  await deleteDatabase(library.REPORT_LIBRARY_DB_NAME);
});

test("saves and reopens complete reports with follow-up history", async () => {
  const analysis = makeAnalysis("First report");
  const saved = await library.saveReport({
    analysis,
    qa: [{ question: "What next?", answer: "Ship it." }],
    managedReportId: "managed-123",
  });

  const reopened = await library.getSavedReport(saved.id);
  assert.deepEqual(reopened?.analysis, analysis);
  assert.deepEqual(reopened?.qa, [{ question: "What next?", answer: "Ship it." }]);
  assert.equal(reopened?.managedReportId, "managed-123");
  assert.equal(await library.countSavedReports(), 1);
});

test("updates an existing report and moves it to the top of recent reports", async () => {
  const first = await library.saveReport({ analysis: makeAnalysis("First report"), qa: [] });
  await tick();
  const second = await library.saveReport({ analysis: makeAnalysis("Second report"), qa: [] });

  assert.deepEqual((await library.listRecentReports()).map((report) => report.id), [second.id, first.id]);

  await tick();
  const updated = await library.saveReport({
    id: first.id,
    analysis: first.analysis,
    qa: [{ question: "Saved?", answer: "Yes." }],
  });
  const recent = await library.listRecentReports();

  assert.equal(updated.id, first.id);
  assert.equal(updated.createdAt, first.createdAt);
  assert.equal(recent[0].id, first.id);
  assert.equal(recent[0].qaCount, 1);
  assert.equal(await library.countSavedReports(), 2);
});

test("reopens legacy YouTube titles cleanly without changing report IDs, dates, answers or stored input", async () => {
  const analysis = makeAnalysis("(459) A useful video - YouTube");
  analysis.source.sourceType = "youtube";
  const qa = [{ question: "Why?", answer: "Evidence." }];
  const saved = await library.saveReport({ analysis, qa });
  const reopened = await library.getSavedReport(saved.id);
  assert.equal(reopened.analysis.source.title, "A useful video");
  assert.equal((await library.listRecentReports())[0].title, "A useful video");
  assert.equal(reopened.id, saved.id);
  assert.equal(reopened.updatedAt, saved.updatedAt);
  assert.deepEqual(reopened.qa, qa);
  assert.equal(analysis.source.title, "(459) A useful video - YouTube");
});

test("deletes a report without affecting the rest of the library", async () => {
  const first = await library.saveReport({ analysis: makeAnalysis("Keep me"), qa: [] });
  const second = await library.saveReport({ analysis: makeAnalysis("Delete me"), qa: [] });

  await library.deleteSavedReport(second.id);

  assert.equal(await library.getSavedReport(second.id), null);
  assert.equal((await library.getSavedReport(first.id))?.analysis.source.title, "Keep me");
  assert.equal(await library.countSavedReports(), 1);
});

test("keeps the recent view short while allowing the entire library to be opened", async () => {
  for (let index = 1; index <= 8; index += 1) {
    await library.saveReport({ analysis: makeAnalysis(`Report ${index}`), qa: [] });
    await tick();
  }

  assert.equal((await library.listRecentReports(6)).length, 6);
  assert.equal((await library.listRecentReports(8)).length, 8);
  assert.equal(await library.countSavedReports(), 8);
});

test("searches titles, report content, and follow-up answers", async () => {
  await library.saveReport({
    analysis: { ...makeAnalysis("Launch review"), summary: "Activation improved after onboarding." },
    qa: [{ question: "What should we measure?", answer: "Measure seven-day retention." }],
  });
  await library.saveReport({ analysis: makeAnalysis("中文产品分析"), qa: [] });

  assert.deepEqual((await library.listSavedReports({ query: "launch retention" })).reports.map((r) => r.title), ["Launch review"]);
  assert.deepEqual((await library.listSavedReports({ query: "产品" })).reports.map((r) => r.title), ["中文产品分析"]);
  assert.equal((await library.listSavedReports({ query: "missing" })).reports.length, 0);
});

test("exports and imports the complete portable library without managed credentials", async () => {
  const first = await library.saveReport({
    analysis: makeAnalysis("Portable report"),
    qa: [{ question: "Portable?", answer: "Yes." }],
    managedReportId: "server-only-id",
  });
  await library.saveReport({ analysis: makeAnalysis("Second report"), qa: [] });

  const exported = await library.exportReportLibrary();
  const document = JSON.parse(exported.json);
  assert.equal(exported.reportCount, 2);
  assert.equal(document.format, library.REPORT_LIBRARY_EXPORT_FORMAT);
  assert.equal(document.version, library.REPORT_LIBRARY_EXPORT_VERSION);
  assert.equal("managedReportId" in document.reports[0], false);

  await library.clearReportLibrary();
  const result = await library.importReportLibrary(exported.json);
  const reopened = await library.getSavedReport(first.id);

  assert.deepEqual(result, { imported: 2, updated: 0, skipped: 0, invalid: 0 });
  assert.deepEqual(reopened?.qa, [{ question: "Portable?", answer: "Yes." }]);
  assert.equal(reopened?.managedReportId, null);
  assert.equal(await library.countSavedReports(), 2);
});

test("import merges by stable ID and keeps the newest copy", async () => {
  const existing = await library.saveReport({ analysis: makeAnalysis("Original title"), qa: [] });
  const exported = await library.exportReportLibrary();
  const document = JSON.parse(exported.json);
  document.reports[0].updatedAt = existing.updatedAt + 1_000;
  document.reports[0].analysis.source.title = "Updated title";

  const updated = await library.importReportLibrary(JSON.stringify(document));
  const skipped = await library.importReportLibrary(JSON.stringify(document));

  assert.deepEqual(updated, { imported: 0, updated: 1, skipped: 0, invalid: 0 });
  assert.deepEqual(skipped, { imported: 0, updated: 0, skipped: 1, invalid: 0 });
  assert.equal((await library.getSavedReport(existing.id))?.analysis.source.title, "Updated title");
});

test("isolates corrupt records instead of hiding valid reports", async () => {
  await library.saveReport({ analysis: makeAnalysis("Healthy report"), qa: [] });
  await putRawRecord(library.REPORT_LIBRARY_DB_NAME, {
    id: "damaged-report",
    schemaVersion: 1,
    createdAt: 10,
    updatedAt: 20,
    analysis: { summary: "missing required fields" },
    qa: [],
  });

  const listed = await library.listSavedReports();
  const exported = await library.exportReportLibrary();

  assert.equal(listed.total, 1);
  assert.equal(listed.invalid, 1);
  assert.equal(listed.reports[0].title, "Healthy report");
  assert.equal(exported.reportCount, 1);
  assert.equal(exported.excludedInvalid, 1);
});

test("imports valid reports while explicitly counting damaged entries", async () => {
  const saved = await library.saveReport({ analysis: makeAnalysis("Valid import"), qa: [] });
  const exported = JSON.parse((await library.exportReportLibrary()).json);
  exported.reports.push({ id: "broken" });
  await library.clearReportLibrary();

  const result = await library.importReportLibrary(JSON.stringify(exported));

  assert.deepEqual(result, { imported: 1, updated: 0, skipped: 0, invalid: 1 });
  assert.equal((await library.getSavedReport(saved.id))?.analysis.source.title, "Valid import");
});

test("rejects an invalid import file without changing the current library", async () => {
  await library.saveReport({ analysis: makeAnalysis("Keep existing"), qa: [] });

  await assert.rejects(
    library.importReportLibrary(JSON.stringify({ format: "something-else", reports: [] })),
    (error) => error?.name === "ReportLibraryImportError",
  );
  assert.equal(await library.countSavedReports(), 1);
});

test("turns quota failures into a recoverable library error without deleting reports", async () => {
  await library.saveReport({ analysis: makeAnalysis("Already saved"), qa: [] });
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function quotaFailure() {
    throw new DOMException("Storage full", "QuotaExceededError");
  };

  try {
    await assert.rejects(
      library.saveReport({ analysis: makeAnalysis("Cannot save"), qa: [] }),
      (error) => error?.name === "ReportLibraryQuotaError",
    );
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }

  assert.equal(await library.countSavedReports(), 1);
  assert.equal((await library.listSavedReports()).reports[0].title, "Already saved");
});

test("aborts an import cleanly when storage fills and preserves the current library", async () => {
  const existing = await library.saveReport({ analysis: makeAnalysis("Existing report"), qa: [] });
  const document = JSON.parse((await library.exportReportLibrary()).json);
  document.reports.push({
    ...document.reports[0],
    id: "new-imported-report",
    createdAt: existing.createdAt + 1,
    updatedAt: existing.updatedAt + 1,
    analysis: makeAnalysis("New imported report"),
  });

  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function quotaFailure() {
    throw new DOMException("Storage full", "QuotaExceededError");
  };

  try {
    await assert.rejects(
      library.importReportLibrary(JSON.stringify(document)),
      (error) => error?.name === "ReportLibraryQuotaError",
    );
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }

  assert.equal(await library.countSavedReports(), 1);
  assert.equal((await library.getSavedReport(existing.id))?.analysis.source.title, "Existing report");
  assert.equal(await library.getSavedReport("new-imported-report"), null);
});

test("reports origin storage pressure and requests persistent storage safely", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      storage: {
        estimate: async () => ({ usage: 90, quota: 100 }),
        persisted: async () => false,
        persist: async () => true,
      },
    },
  });

  try {
    assert.deepEqual(await library.getReportLibraryStorageStatus(), {
      usage: 90,
      quota: 100,
      ratio: 0.9,
      persistent: false,
    });
    assert.equal(await library.ensurePersistentReportStorage(), true);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  }
});

test("upgrades an older database in place without erasing saved reports", async () => {
  const legacy = {
    schemaVersion: 1,
    id: "legacy-report",
    createdAt: 100,
    updatedAt: 200,
    analysis: makeAnalysis("Legacy report"),
    qa: [{ question: "Still here?", answer: "Yes." }],
    managedReportId: null,
  };
  await seedVersionOneDatabase(library.REPORT_LIBRARY_DB_NAME, legacy);

  const recent = await library.listRecentReports();
  const reopened = await library.getSavedReport(legacy.id);

  assert.equal(library.REPORT_LIBRARY_DB_VERSION, 2);
  assert.equal(recent[0].title, "Legacy report");
  assert.deepEqual(reopened?.qa, legacy.qa);
});

function makeAnalysis(title) {
  return {
    source: {
      sourceType: "youtube",
      title,
      url: "https://www.youtube.com/watch?v=test",
      durationSeconds: 90,
      limitations: [],
    },
    mode: "general",
    outputLanguage: "en",
    prompt: "Summarize this video.",
    summary: `${title} summary`,
    timeline: { segments: [] },
    findings: [],
    recommendations: [],
    tasks: [],
    limitations: [],
    confidence: "high",
  };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 2));
}

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Database ${name} is still open.`));
  });
}

function seedVersionOneDatabase(name, report) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("reports", { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("reports", "readwrite");
      transaction.objectStore("reports").put(report);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}

function putRawRecord(name, record) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, library.REPORT_LIBRARY_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("reports", "readwrite");
      transaction.objectStore("reports").put(record);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}
