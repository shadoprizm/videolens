# VideoLens Firefox 0.8.4 — reviewer build instructions

This source archive reproduces the packaged Firefox extension build. The
extension is written in TypeScript and bundled as minified ES modules with
esbuild. It does not download or execute remote code.

## Changes in this release

Chrome and Firefox share the same source and processing disclosure. This release adds actual non-speech sound observations for Managed local-file reports. After the versioned notice naming DeepInfra serving Xiaomi MiMo is accepted, short PCM audio chunks go to the authenticated VideoLens API. The API independently describes fixed audio windows and retains only conservative agreement across alternate encodings; digital silence is not sent to a model. Sound observations remain separate from transcripts and visual evidence in reports, follow-up answers and exports. Browser-tab captions and Private/BYOK mode do not analyze non-speech sounds; those limitations are disclosed. No new extension permissions, remote executable code or background capture are introduced. Existing reports and settings are preserved; the processing notice requires fresh acceptance.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

The submitted build was verified on macOS 26.5 (Apple Silicon), using Node.js
22.22.3 and npm 10.9.8. Use those Node/npm versions to reproduce the verified
build. Node.js installers and release archives are available from
https://nodejs.org/en/download.

No environment variables, credentials, or external services are required to
build the extension.

## Build the reviewed Firefox files

The archive contains `extension/`, the shared recipe, procedure and lesson modules under `site/shared/`,
the two shared reader files under `site/`, and bounded event types in `site/shared/journey.ts`.
From the root of this source archive:

```sh
cd extension
npm ci
npm run build:firefox
```

The reviewable Firefox extension is written to `dist-firefox/`.

## Create the upload ZIP

```sh
npm run package:firefox
```

This creates `releases/firefox/videolens-firefox-v<version>.zip` for submission to
Mozilla Add-ons. This source archive belongs only in Mozilla's separate source-code field.
Submission and publication status are recorded in `release-tracker.json`.

## Optional verification

```sh
npm run typecheck
npm test
npm run lint:firefox
```

The build entry point is `build.mjs`. For Firefox it bundles
`src/background.firefox.ts`, `src/sidepanel/main.ts` and `src/reader/main.ts`, copies `public/`, and
replaces the copied Chrome manifest with `manifest.firefox.json`.
The full-page reader imports `../site/cloud-report.ts` and `../site/cloud-report.css`,
the same rendering code and styles used on the VideoLens website. Both files and their shared recipe and procedure dependencies are included.

Public source repository: https://github.com/shadoprizm/videolens
