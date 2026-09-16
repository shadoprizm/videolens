# VideoLens Firefox 0.4.6 — reviewer build instructions

This source archive reproduces the packaged Firefox extension build. The
extension is written in TypeScript and bundled as unminified ES modules with
esbuild. It does not download or execute remote code.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

No environment variables, credentials, or external services are required to
build the extension.

## Build the reviewed Firefox files

The archive contains `extension/` and the two shared reader files under `site/`.
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
the same rendering code and styles used on the VideoLens website. Both files are included.

Public source repository: https://github.com/shadoprizm/videolens
