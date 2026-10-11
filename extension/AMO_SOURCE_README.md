# VideoLens Firefox 0.8.0 — reviewer build instructions

This source archive reproduces the packaged Firefox extension build. The
extension is written in TypeScript and bundled as minified ES modules with
esbuild. It does not download or execute remote code.

## Changes in this release

Chrome and Firefox share the same UI. This release adds mode-specific next steps,
suggested follow-up questions, and optional usefulness feedback on managed reports.
Clicking a rating sends only the rating and managed report ID to the authenticated
VideoLens service. Failed managed scans now send a fixed stage and error category,
alongside their existing source category and selected mode. This restores allowance
and diagnoses failures without raw errors or content. Private/BYOK scans send no
diagnostics or ratings to VideoLens. The versioned first-run disclosure explains
this data use before analysis. No background browsing tracking or session replay
is used. Existing local reports and settings are preserved.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

No environment variables, credentials, or external services are required to
build the extension.

## Build the reviewed Firefox files

The archive contains `extension/`, the shared recipe, procedure and lesson modules under `site/shared/`,
the two shared reader files under `site/`, and bounded event types in `shared/journey.ts`.
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
