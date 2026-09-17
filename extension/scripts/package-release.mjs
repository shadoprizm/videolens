import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const extensionRoot = resolve(dirname(scriptPath), "..");
const repositoryRoot = resolve(extensionRoot, "..");
const packageJson = JSON.parse(readFileSync(resolve(extensionRoot, "package.json"), "utf8"));
const target = process.argv[2];

const targets = {
  chrome: {
    buildDirectory: resolve(extensionRoot, "dist"),
    artifact: resolve(extensionRoot, "releases", "chrome", `videolens-chrome-v${packageJson.version}.zip`),
  },
  firefox: {
    buildDirectory: resolve(extensionRoot, "dist-firefox"),
    artifact: resolve(extensionRoot, "releases", "firefox", `videolens-firefox-v${packageJson.version}.zip`),
  },
};

function runZip(cwd, artifact, entries) {
  mkdirSync(dirname(artifact), { recursive: true });
  rmSync(artifact, { force: true });

  const result = spawnSync("zip", ["-qr", artifact, ...entries, "-x", "*/.DS_Store"], {
    cwd,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`zip exited with status ${result.status}`);
  }

  console.log(`packaged ${artifact}`);
}

if (target === "firefox-source") {
  const artifact = resolve(
    extensionRoot,
    "releases",
    "firefox",
    "source",
    `videolens-firefox-source-v${packageJson.version}.zip`,
  );
  runZip(repositoryRoot, artifact, [
    "extension/src",
    "extension/public",
    "extension/test",
    "extension/evaluation",
    "extension/scripts",
    "extension/package.json",
    "extension/package-lock.json",
    "extension/build.mjs",
    "extension/tsconfig.json",
    "extension/manifest.firefox.json",
    "extension/release-tracker.json",
    "extension/AMO_SOURCE_README.md",
    "extension/RECIPE_PREVIEW.md",
    "extension/PROCEDURE.md",
    "extension/LESSON.md",
    "extension/gen-icons.mjs",
    "site/shared",
    "site/cloud-report.ts",
    "site/cloud-report.css",
    "LICENSE",
  ]);
} else if (targets[target]) {
  const { buildDirectory, artifact } = targets[target];
  runZip(buildDirectory, artifact, ["."]);
} else {
  throw new Error(`Unsupported package target: ${target ?? "(missing)"}`);
}
