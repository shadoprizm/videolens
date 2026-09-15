import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/report.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const source = bundle.outputFiles[0].text;
const report = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const analysis = {
  source: { sourceType: "youtube", title: "中文测试视频", url: "https://youtube.com/watch?v=test", durationSeconds: 90, limitations: [] },
  mode: "general",
  outputLanguage: "zh-CN",
  prompt: "总结视频",
  summary: "这是中文摘要。",
  timeline: { segments: [] },
  findings: [{ finding: "重要发现", evidence: [{ timestamp: 12, detail: "证据" }], confidence: "high" }],
  recommendations: [],
  tasks: [],
  limitations: [],
  confidence: "high",
};

test("Markdown and HTML exports localize report chrome", () => {
  const markdown = report.toMarkdown(analysis, [{ question: "为什么？", answer: "因为。" }]);
  const html = report.toHtmlReport(analysis, []);

  assert.match(markdown, /## 执行摘要/);
  assert.match(markdown, /## 核心发现/);
  assert.match(markdown, /## 后续问答/);
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /AI 视频报告/);
  assert.match(html, /打开原视频/);
});

test("report filenames retain non-Latin titles", () => {
  assert.equal(report.reportFilename(analysis, "html"), "中文测试视频-videolens.html");
});

test("new locale exports keep localized report chrome end to end", () => {
  const locales = [
    ["es", "es-419", "Resumen ejecutivo", "Preguntas de seguimiento"],
    ["ro", "ro", "Rezumat executiv", "Întrebări și răspunsuri ulterioare"],
    ["hi", "hi", "कार्यकारी सारांश", "अनुवर्ती सवाल-जवाब"],
  ];
  for (const [outputLanguage, htmlLanguage, summaryHeading, followUpHeading] of locales) {
    const localized = {
      ...analysis,
      outputLanguage,
      source: { ...analysis.source, title: `Locale ${outputLanguage}` },
    };
    const markdown = report.toMarkdown(localized, [{ question: "Q", answer: "A" }]);
    const html = report.toHtmlReport(localized, []);
    assert.match(markdown, new RegExp(`## ${summaryHeading}`));
    assert.match(markdown, new RegExp(`## ${followUpHeading}`));
    assert.match(html, new RegExp(`<html lang="${htmlLanguage}">`));
  }
});
