import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultExtensionRoot = resolve(dirname(scriptPath), "..");

function readJson(extensionRoot, relativePath) {
  return JSON.parse(readFileSync(resolve(extensionRoot, relativePath), "utf8"));
}

export function verifyBrowserParity(extensionRoot = defaultExtensionRoot) {
  const packageJson = readJson(extensionRoot, "package.json");
  const chromeManifest = readJson(extensionRoot, "public/manifest.json");
  const firefoxManifest = readJson(extensionRoot, "manifest.firefox.json");
  const releaseTracker = readJson(extensionRoot, "release-tracker.json");
  const version = packageJson.version;

  assert.equal(chromeManifest.version, version, "Chrome manifest version must match package.json");
  assert.equal(firefoxManifest.version, version, "Firefox manifest version must match package.json");
  assert.equal(releaseTracker.targetVersion, version, "Release tracker targetVersion must match package.json");

  for (const browser of ["chrome", "firefox"]) {
    assert.ok(releaseTracker[browser], `Release tracker must include ${browser}`);
    assert.equal(
      releaseTracker[browser].packageVersion,
      version,
      `${browser} packageVersion must match package.json`,
    );
    assert.equal(typeof releaseTracker[browser].artifact, "string", `${browser} artifact must be tracked`);
    assert.ok(
      releaseTracker[browser].artifact.startsWith(`releases/${browser}/`),
      `${browser} artifact must be stored under releases/${browser}/`,
    );
    assert.equal(typeof releaseTracker[browser].status, "string", `${browser} store status must be tracked`);
  }

  assert.ok(
    releaseTracker.firefox.sourceArtifact.startsWith("releases/firefox/source/"),
    "Firefox reviewer source must be stored separately under releases/firefox/source/",
  );

  for (const field of [
    "name",
    "description",
    "default_locale",
    "host_permissions",
    "optional_host_permissions",
    "action",
    "icons",
  ]) {
    assert.deepEqual(
      firefoxManifest[field],
      chromeManifest[field],
      `Shared manifest field ${field} must stay aligned across Chrome and Firefox`,
    );
  }

  const chromeSharedPermissions = chromeManifest.permissions
    .filter((permission) => permission !== "sidePanel")
    .sort();
  assert.deepEqual(
    [...firefoxManifest.permissions].sort(),
    chromeSharedPermissions,
    "Shared extension permissions must stay aligned across Chrome and Firefox",
  );

  for (const [scriptName, requiredCommands] of Object.entries({
    build: ["build:chrome", "build:firefox"],
    package: ["package:chrome", "package:firefox"],
  })) {
    const command = packageJson.scripts?.[scriptName] ?? "";
    for (const requiredCommand of requiredCommands) {
      assert.match(
        command,
        new RegExp(`npm run ${requiredCommand.replace(":", "\\:")}`),
        `npm run ${scriptName} must include ${requiredCommand}`,
      );
    }
  }

  return { version };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const { version } = verifyBrowserParity();
  console.log(`Chrome/Firefox release parity verified for v${version}.`);
}
