import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/languages.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const source = bundle.outputFiles[0].text;
const languages = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("normalizes Chrome and caption language tags", () => {
  assert.equal(languages.normalizeLanguageTag("zh_CN"), "zh-CN");
  assert.equal(languages.normalizeLanguageTag("zh-Hant-HK"), "zh-TW");
  assert.equal(languages.normalizeLanguageTag("pt-PT"), "pt-BR");
  assert.equal(languages.normalizeLanguageTag("es-419"), "es");
  assert.equal(languages.normalizeLanguageTag("ro-RO"), "ro");
  assert.equal(languages.normalizeLanguageTag("hi-IN"), "hi");
  assert.equal(languages.normalizeLanguageTag("ar"), null);
});

test("browser and source language preferences resolve independently", () => {
  assert.equal(languages.resolveReportLanguage("browser", "zh-TW"), "zh-TW");
  assert.equal(languages.resolveReportLanguage("source", "en", "zh-CN"), "zh-CN");
  assert.equal(languages.resolveReportLanguage("source", "zh-CN", null), "source");
  assert.equal(languages.resolveReportLanguage("ja", "en", "zh-CN"), "ja");
  assert.equal(languages.resolveReportLanguage("browser", "ro-RO"), "ro");
  assert.equal(languages.resolveReportLanguage("browser", "hi-IN"), "hi");
});

test("source-language instruction preserves the video's language", () => {
  assert.match(languages.languageInstruction("source"), /dominant language/);
  assert.match(languages.languageInstruction("zh-CN"), /简体中文 \(zh-CN\)/);
  assert.match(languages.languageInstruction("ro"), /Română \(ro\)/);
  assert.match(languages.languageInstruction("hi"), /हिन्दी \(hi\)/);
});
