import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("browser manifests and package versions match and every interface locale has metadata", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
  const firefoxManifest = JSON.parse(readFileSync("manifest.firefox.json", "utf8"));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(manifest.version, pkg.version);
  assert.equal(firefoxManifest.version, pkg.version);
  assert.equal(manifest.default_locale, "en");
  assert.equal(firefoxManifest.default_locale, "en");

  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.equal(firefoxManifest.permissions.includes("sidePanel"), false);
  assert.equal(firefoxManifest.sidebar_action.default_panel, "sidepanel.html");
  assert.deepEqual(firefoxManifest.background.scripts, ["background.js"]);
  assert.match(firefoxManifest.browser_specific_settings.gecko.id, /@/);
  assert.ok(firefoxManifest.browser_specific_settings.gecko.data_collection_permissions.required.includes("websiteContent"));

  for (const locale of ["en", "zh_CN", "zh_TW", "es_419", "ro", "hi"]) {
    const messages = JSON.parse(readFileSync(`public/_locales/${locale}/messages.json`, "utf8"));
    assert.ok(messages.extensionName.message);
    assert.ok(messages.extensionDescription.message);
    assert.ok(messages.actionTitle.message);
    assert.ok(messages.extensionDescription.message.length <= 132, `${locale} description exceeds the store limit`);
  }
});
