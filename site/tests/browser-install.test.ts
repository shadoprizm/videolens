import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it } from "vitest";
const code = readFileSync(new URL("../analytics.js", import.meta.url), "utf8");
it.each([ ["Mozilla Firefox/142.0", "Firefox", "addons.mozilla.org"], ["Mozilla Chrome/140.0", "Chrome", "chromewebstore.google.com"], ["Safari/605.1", "Chrome", "chromewebstore.google.com"] ])("routes install CTAs correctly for %s", (userAgent, name, host) => {
  const link = { href: "", textContent: "", dataset: {} };
  const context = { navigator: { userAgent }, window: {}, document: { querySelectorAll: (selector: string) => selector === "[data-extension-cta]" ? [link] : [], addEventListener: () => {} } };
  vm.runInNewContext(code, context);
  expect(new URL(link.href).hostname).toBe(host); expect(link.textContent).toContain(name);
});
it("offers both browser links in static HTML without JavaScript", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  expect(html).toMatch(/browser-choices[\s\S]*?chromewebstore.google.com[\s\S]*?addons.mozilla.org/);
});
