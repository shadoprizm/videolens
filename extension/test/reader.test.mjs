import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { indexedDB } from "fake-indexeddb";
import { parseHTML } from "linkedom";

const bundle = async (entry, target = "chrome116") => (await build({
  entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "browser", target,
  define: { __REPORT_CSS__: JSON.stringify(readFileSync("../site/cloud-report.css", "utf8")) },
})).outputFiles[0].text;
const load = (source, key) => import(`data:text/javascript;base64,${Buffer.from(`${source}\n// ${key}`).toString("base64")}`);
const librarySource = await bundle("src/lib/reportLibrary.ts");
const demoSource = await bundle("src/lib/demo.ts");

test("both browser readers open a saved report and Q&A offline, with working print controls", async () => {
  const globals = ["window", "document", "DOMParser", "location", "navigator", "indexedDB", "chrome", "fetch"];
  const originals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB });
    const library = await load(librarySource, "library-reader-test");
    const demo = await load(demoSource, "demo-reader-test");
    const saved = await library.saveReport({ analysis: demo.DEMO_ANALYSIS, qa: demo.DEMO_QA });
    for (const target of ["chrome116", "firefox140"]) {
      const { window } = parseHTML(readFileSync("public/reader.html", "utf8"));
      let prints = 0;
      window.print = () => { prints++; };
      const replacements = {
        window, document: window.document, DOMParser: window.DOMParser,
        location: { search: `?id=${encodeURIComponent(saved.id)}` },
        navigator: { language: "en-US" }, chrome: { i18n: { getUILanguage: () => "en-US" } },
        fetch: async () => { throw new Error("A local reader must not use the network"); },
      };
      for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
      await load(await bundle("src/reader/main.ts", target), target);
      for (let i = 0; i < 100 && !document.querySelector(".cloud-report"); i++) await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(document.querySelector(".cloud-report h1")?.textContent, saved.analysis.source.title);
      assert.match(document.querySelector("#reader-content").textContent, /What should the team measure first/);
      assert.equal(document.querySelector("script[src='reader.js']") !== null, true);
      const print = Array.from(document.querySelectorAll("#reader-actions button")).find(button => /PDF/.test(button.textContent));
      assert.ok(print);
      print.click();
      assert.equal(prints, 1);
      assert.equal(document.querySelector("details").open, true);
      assert.equal(await library.countSavedReports() >= 1, true);
    }
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
