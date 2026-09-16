import { describe, expect, it } from "vitest";
import { reportBody, reportFilename, reportHtml, reportJson, reportMarkdown, reportSearchText, reportTitle, safeSourceUrl, type CloudReport } from "../cloud-report.js";

const report: CloudReport = {
  id: "saved-report", title: "(459) A useful video - YouTube", source_type: "youtube", mode: "general",
  created_at: "2026-09-13T12:00:00Z", completed_at: null,
  report_data: {
    source: { title: "(459) A useful video - YouTube", sourceType: "youtube", url: "https://www.youtube.com/watch?v=test", durationSeconds: 90 },
    summary: "First paragraph.\n\nSecond paragraph.", prompt: "Explain the results", confidence: "high",
    findings: [{ finding: "Finding one", confidence: "high", evidence: [{ timestamp: 12, detail: "Visible proof" }] }],
    recommendations: [{ recommendation: "Try again", rationale: "A good reason", confidence: "medium" }],
    tasks: [{ title: "Next action", detail: "Action details" }], limitations: ["Limited sample"],
    qa: [{ question: "Why?", answer: "Because of the follow-up evidence." }],
    timeline: { segments: [{ start: 12, end: 20, transcript: "Transcript-only search term", visualSummary: "Visual context", ocr: ["On-screen text"] }] },
  },
};

describe("cloud report reader and exports", () => {
  it("cleans legacy YouTube tab labels while preserving genuine numbered titles and other sources", () => {
    expect(reportTitle(report)).toBe("A useful video");
    expect(reportTitle({ ...report, title: "(2026) Annual review" })).toBe("(2026) Annual review");
    expect(reportTitle({ ...report, title: "(459) Meeting - YouTube", source_type: "local_file", report_data: null })).toBe("(459) Meeting - YouTube");
  });
  it("keeps every saved report section in the reader and portable exports", () => {
    for (const content of [reportBody(report), reportHtml(report, "body { margin: 0; }"), reportMarkdown(report)]) {
      for (const value of ["First paragraph.", "Second paragraph.", "Finding one", "Visible proof", "Try again", "A good reason", "Next action", "Limited sample", "Why?", "Because of the follow-up evidence.", "Transcript-only search term", "Visual context", "On-screen text", "Explain the results"]) expect(content).toContain(value);
    }
    expect(reportBody(report)).toContain("t=12s");
    expect(reportHtml(report, "")).toContain('class="cr-timeline" open');
    expect(JSON.parse(reportJson(report)).source.title).toBe("A useful video");
    expect(JSON.parse(reportJson(report)).qa).toEqual(report.report_data!.qa);
    expect(report.title).toContain("(459)"); // Normalization does not mutate stored data.
  });
  it("searches evidence and answers, and keeps international filenames", () => {
    expect(reportSearchText(report)).toContain("transcript-only search term");
    expect(reportSearchText(report)).toContain("follow-up evidence");
    expect(reportFilename({ ...report, title: "中文报告" }, "html")).toBe("中文报告-videolens.html");
  });
  it("renders malicious report text as text and rejects executable source URLs", () => {
    const unsafe = { ...report, title: '<img src=x onerror="alert(1)">', report_data: { ...report.report_data, source: { url: "javascript:alert(1)" }, summary: "</style><script>alert(1)</script>" } };
    const html = reportHtml(unsafe, "");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;script&gt;");
    expect(safeSourceUrl("data:text/html,test")).toBeNull();
    expect(safeSourceUrl("https://user:secret@example.com/")).toBeNull();
    expect(reportBody({ ...report, report_data: { ...report.report_data, source: { url: "https://notyoutube.com/" } } })).not.toContain("t=12s");
  });
  it("isolates malformed older fields instead of crashing the library", () => {
    const older = { ...report, created_at: "invalid", report_data: { summary: "Still readable", findings: [null, 7, { evidence: [null] }], recommendations: {}, timeline: null } };
    expect(reportBody(older)).toContain("Still readable");
    expect(reportMarkdown(older)).toContain("Still readable");
    expect(reportBody({ ...report, report_data: null })).toContain("No summary was saved");
  });
});
