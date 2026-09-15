import { getSavedReport, listSavedReports, type SavedReport } from "./reportLibrary";
import { uploadSavedReport } from "./pro";
import { getCloudLibraryEnabled, getProSession } from "./storage";

export interface UploadProgress { done: number; total: number; failed: number; skipped: number; cancelled: boolean }

// Serial requests bound memory and prevent overlapping full-library and follow-up uploads.
let pending: Promise<void> = Promise.resolve();
export function uploadReportCopy(token: string, report: SavedReport, onlyWhenEnabled = false): Promise<void> {
  const request = pending.catch(() => undefined).then(async () => {
    if ((await getProSession())?.token !== token) throw new Error("Account changed. Connect the intended account and retry.");
    if (onlyWhenEnabled && !(await getCloudLibraryEnabled())) return;
    await uploadSavedReport(token, report);
  });
  pending = request;
  return request;
}

export async function uploadLocalLibrary(
  token: string,
  onProgress: (progress: UploadProgress) => void,
  cancelled: () => boolean = () => false,
): Promise<UploadProgress> {
  const inventory = await listSavedReports();
  const progress: UploadProgress = { done: 0, total: inventory.total, failed: 0, skipped: inventory.invalid, cancelled: false };
  onProgress({ ...progress });
  for (const summary of inventory.reports) {
    if (cancelled() || (await getProSession())?.token !== token) { progress.cancelled = true; break; }
    try {
      // Read the latest copy just before uploading, including any new follow-up answers.
      const report = await getSavedReport(summary.id);
      if (report) { await uploadReportCopy(token, report); progress.done++; }
      else progress.skipped++;
    } catch { progress.failed++; }
    onProgress({ ...progress });
  }
  onProgress({ ...progress });
  return progress;
}
