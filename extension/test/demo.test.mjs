import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/demo.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const source = bundle.outputFiles[0].text;
const demo = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("sample reports are localized throughout for every new interface locale", () => {
  const locales = [
    ["es-MX", "es", "Informe de muestra", "¿Qué debería medir"],
    ["ro-RO", "ro", "Raport demonstrativ", "Ce ar trebui să măsoare"],
    ["hi-IN", "hi", "नमूना रिपोर्ट", "टीम को सबसे पहले"],
  ];
  for (const [language, outputLanguage, title, question] of locales) {
    const content = demo.demoContent(language);
    assert.equal(content.analysis.outputLanguage, outputLanguage);
    assert.match(content.analysis.source.title, new RegExp(title));
    assert.match(content.qa[0].question, new RegExp(question));
    assert.notEqual(content.analysis.summary, demo.DEMO_ANALYSIS.summary);
    assert.notEqual(content.analysis.timeline.segments[0].transcript, demo.DEMO_ANALYSIS.timeline.segments[0].transcript);
  }
});
