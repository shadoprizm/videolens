// The web account and extension use the exact same pure reader and stylesheet.
import { reportBody, reportFilename, reportHtml, reportJson, reportMarkdown, reportTitle, type CloudReport } from "../../../site/cloud-report";
import { getSavedReport, listSavedReports } from "../lib/reportLibrary";
import { readerCopy } from "../lib/readerCopy";
import { documentLanguage, t } from "../lib/i18n";
import { download } from "../lib/report";

declare const __REPORT_CSS__: string;

const content = document.getElementById("reader-content")!;
const actions = document.getElementById("reader-actions")!;
const status = document.getElementById("reader-status")!;
const id = new URLSearchParams(location.search).get("id");
document.documentElement.lang = documentLanguage();
document.getElementById("reader-library")!.textContent = `← ${t("libraryNav")}`;
status.textContent = readerCopy.local;
let current: CloudReport | null = null;

function button(label: string, action: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", action);
  return element;
}

async function render(): Promise<void> {
  try {
    if (!id) {
      const library = await listSavedReports();
      content.replaceChildren();
      const heading = document.createElement("h1");
      heading.textContent = t("reportLibrary");
      content.append(heading);
      content.classList.add("reader-library");
      if (!library.reports.length) {
        const empty = document.createElement("p");
        empty.textContent = t("libraryEmptyTitle");
        content.append(empty);
      }
      for (const report of library.reports) {
        const link = document.createElement("a");
        link.href = `reader.html?id=${encodeURIComponent(report.id)}`;
        link.textContent = report.title || t("untitledVideo");
        content.append(link);
      }
      return;
    }
    const saved = await getSavedReport(id);
    if (!saved) throw new Error(t("reportNotFound"));
    current = {
      id: saved.id, title: saved.analysis.source.title || t("untitledVideo"),
      source_type: saved.analysis.source.sourceType, mode: saved.analysis.mode,
      report_data: { ...saved.analysis, qa: saved.qa },
      created_at: new Date(saved.createdAt).toISOString(), completed_at: null,
    };
    document.title = `${reportTitle(current)} — VideoLens`;
    const rendered = new DOMParser().parseFromString(`<!doctype html><html><body>${reportBody(current)}</body></html>`, "text/html");
    content.replaceChildren(...Array.from(rendered.body.childNodes, node => document.importNode(node, true)));
    actions.replaceChildren(
      button(readerCopy.refresh, () => void render()),
      button(t("printPdf"), () => {
        content.querySelectorAll("details").forEach(details => { details.open = true; });
        window.print();
      }),
      button(t("downloadHtml"), () => {
        if (current) download(reportFilename(current, "html"), reportHtml(current, __REPORT_CSS__), "text/html");
      }),
      button(t("markdown"), () => {
        if (current) download(reportFilename(current, "md"), reportMarkdown(current), "text/markdown");
      }),
      button(t("json"), () => {
        if (current) download(reportFilename(current, "json"), reportJson(current), "application/json");
      }),
    );
  } catch (error) {
    actions.replaceChildren();
    content.replaceChildren();
    const message = document.createElement("p");
    message.className = "reader-error";
    message.setAttribute("role", "alert");
    message.textContent = error instanceof Error ? error.message : t("libraryLoadFailed");
    content.append(message);
  }
}

void render();
