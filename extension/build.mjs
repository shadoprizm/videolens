import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";

const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
const target = targetArg?.slice("--target=".length) ?? "chrome";

if (target !== "chrome" && target !== "firefox") {
  throw new Error(`Unsupported extension target: ${target}`);
}

const outdir = target === "firefox" ? "dist-firefox" : "dist";
const browserTarget = target === "firefox" ? "firefox140" : "chrome116";

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

// Chrome runs the background bundle as a service worker. Firefox runs the
// same bundle as a non-persistent background script. The injected capture
// code lives inside the sidebar via chrome.scripting in both browsers.
await build({
  entryPoints: {
    background: target === "firefox" ? "src/background.firefox.ts" : "src/background.ts",
    sidepanel: "src/sidepanel/main.ts",
    reader: "src/reader/main.ts",
  },
  bundle: true,
  format: "esm",
  target: browserTarget,
  outdir,
  sourcemap: false,
  minify: true,
  define: { __REPORT_CSS__: JSON.stringify(readFileSync("../site/cloud-report.css", "utf8")) },
});

cpSync("public", outdir, { recursive: true });
cpSync("../site/cloud-report.css", `${outdir}/cloud-report.css`);
rmSync(`${outdir}/.DS_Store`, { force: true });
if (target === "firefox") {
  cpSync("manifest.firefox.json", `${outdir}/manifest.json`);
}
console.log(`built ${target} → ${outdir}/`);
