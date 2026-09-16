import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/i18n.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const source = bundle.outputFiles[0].text;
const i18n = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("selects every supported interface locale from Chrome language tags", () => {
  assert.equal(i18n.detectUiLocale("es-MX"), "es_419");
  assert.equal(i18n.detectUiLocale("es-419"), "es_419");
  assert.equal(i18n.detectUiLocale("ro-RO"), "ro");
  assert.equal(i18n.detectUiLocale("hi-IN"), "hi");
  assert.equal(i18n.detectUiLocale("zh-Hant-HK"), "zh_TW");
  assert.equal(i18n.detectUiLocale("fr-CA"), "en");
});

test("all interface dictionaries have complete keys and matching placeholders", () => {
  const englishKeys = Object.keys(i18n.EN).sort();
  for (const [locale, dictionary] of Object.entries(i18n.UI_DICTIONARIES)) {
    assert.deepEqual(Object.keys(dictionary).sort(), englishKeys, `${locale} must translate every interface key`);
    for (const key of englishKeys) {
      assert.deepEqual(placeholders(dictionary[key]), placeholders(i18n.EN[key]), `${locale}.${key} placeholders must match English`);
    }
  }
});

function placeholders(value) {
  return [...value.matchAll(/\{([a-z]+)\}/g)].map((match) => match[1]).sort();
}
