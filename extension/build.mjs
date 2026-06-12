import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const outdir = "dist";

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

// Service worker and side panel are ES modules; the injected capture code
// lives inside sidepanel via chrome.scripting (no standalone content script).
await build({
  entryPoints: {
    background: "src/background.ts",
    sidepanel: "src/sidepanel/main.ts",
  },
  bundle: true,
  format: "esm",
  target: "chrome116",
  outdir,
  sourcemap: false,
  minify: false,
});

cpSync("public", outdir, { recursive: true });
console.log("built → dist/");
