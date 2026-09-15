# Publishing runbook — VideoLens

The extension has a permanent free Private / BYOK mode and an optional Pro / Managed mode. Free calls
OpenAI directly with the user's key. Pro uses a VideoLens account, a server-managed report allowance,
and optional cloud report storage. Version 0.2.0 was the first Web Store submission; version 0.3.0
introduced the Pro account. Version 0.3.1 adds optional YouTube access so capture also works when the
panel is opened from Chrome's side-panel picker. Version 0.3.2 fixes follow-up Q&A request handling
and makes follow-up failures visible beside the question. Version 0.4.0 includes that critical fix,
adds Chinese-first interface localization, multilingual report generation, language-aware caption
selection, and localized follow-up answers and exports. Version 0.4.1 automatically saves completed
reports and follow-up Q&A to an unlimited local library with Continue, reopen, and delete controls.
Version 0.4.2 adds full-library search, portable backup and restore, a clear-library control, damaged-
record isolation, storage-pressure recovery without silently deleting valid reports, and startup
hardening so optional Pro or library recovery cannot leave the side panel blank.
Version 0.4.3 adds complete Latin American Spanish, Romanian, and Hindi interfaces,
localized onboarding and errors, matching Chrome metadata, and localized sample reports.
Version 0.4.4 makes completed reports easier to scan with paragraph breaks in long
executive summaries, numbered findings, separated evidence rows, and more whitespace.

Version 0.4.5 adds an explicit existing-library upload, future cloud saving for BYOK and managed reports plus follow-up answers, account-scoped consent, progress and safe retries. Local reports remain available and uploads use no AI credits.

Version 0.4.6 captures YouTube video headings without notification-count prefixes and cleans legacy YouTube titles when reopening saved reports. Open full report in the sidebar and report-library title links open a full-page extension reader; the return-arrow control keeps follow-up work in the sidebar. The reader works offline with local reports and shares its rendering code and styles with the website cloud reader. The website cloud library now opens complete reports with evidence and saved Q&A, searches full report content, and exports HTML, PDF via print, Markdown, and JSON.

## 1. Build & verify

```bash
cd extension
npm install
npm run release:check
```

`release:check` type-checks and tests the shared code, verifies manifest/version parity,
packages `releases/chrome/videolens-chrome-v<version>.zip`,
`releases/firefox/videolens-firefox-v<version>.zip`, and the separate Firefox reviewer
source archive, then lints the Firefox build. The generic
`npm run build` and `npm run package` commands also target both browsers by default.

Manual smoke test before every submission:
1. `chrome://extensions` → Developer mode → Load unpacked → `extension/dist`.
2. Confirm the first-run disclosure appears before Settings can be opened. Accept it, then use Settings → Review disclosure to confirm it can be revisited.
3. Open a YouTube video with captions → click the VideoLens icon → Settings → save your OpenAI key → choose **Private** → run a **Detailed report** analysis. Expect: captions found, frames captured, report with timestamped findings.
4. Run a **Local file** analysis on a short mp4. Expect: transcription + frames.
5. Download the self-contained HTML report, open it, and verify the complete report is styled correctly without a network connection.
6. Return to the start screen and confirm the report appears in **Recent reports**. Close and reopen Chrome, choose **Continue last report**, and confirm the complete report survives.
7. Ask a follow-up, close and reopen the side panel, and confirm both the question and answer persist. Delete the report and confirm it no longer appears.
8. Search for text in a report and a follow-up answer. Export the full library, clear it, import the backup, and confirm the reports and Q&A return. Import the same file again and confirm reports are not duplicated.
9. At side-panel width, confirm long executive summaries break into readable paragraphs and each numbered finding has clearly separated timestamped evidence. Then click **Print / Save PDF**, choose Chrome's **Save as PDF**, and visually inspect every page.
10. Confirm Private mode has no VideoLens analysis or local-report count limit or lockout.
11. Choose Pro → connect a passwordless account in the browser tab → approve the extension → return to the side panel. Confirm the entitlement appears.
12. Run one managed report with cloud saving off. Confirm no API key is required and usage advances by one.
13. If a test allowance is available, run with cloud saving on and confirm the report appears at `https://videolens.io/account` and can be deleted.
14. Ask a follow-up in both Private and Pro modes. Confirm the answer appears, and confirm a failed request shows an inline error instead of silently resetting.
15. Set report language to Simplified Chinese. Analyze a Chinese-captioned YouTube video and confirm the selected caption track, report, follow-up answer, HTML, and Markdown are Chinese.
16. Repeat with Traditional Chinese, Latin American Spanish, Romanian, and Hindi, then verify **Same as video** and one other output language.
17. Change Chrome's UI language in test profiles for Simplified Chinese, Traditional Chinese, Latin American Spanish, Romanian, and Hindi. Confirm the side panel, Settings, privacy disclosure, progress states, errors, sample report, extension name, and action tooltip are localized.
18. With a connected Pro account, take `videolens.io` offline or revoke its optional site permission, reopen the side panel, and confirm the main UI still appears immediately in Private mode.
19. Disconnect Pro and confirm the local account token is removed and Private mode still works.

Firefox smoke test:
1. Run `npm run start:firefox`; this builds the Firefox package and opens it in a temporary test profile.
2. Confirm the native Firefox sidebar opens automatically and the first-run disclosure appears.
3. Repeat the core YouTube, local-file, report-library, export, Private, and Pro checks above.
4. Confirm Firefox asks for optional YouTube access only when analysis starts, and for optional account data access only when the user connects Pro.

## 2. Chrome Web Store

1. One-time: register at https://chrome.google.com/webstore/devconsole, accept Google's developer terms, and pay the fee shown by Google.
2. New item → upload `releases/chrome/videolens-chrome-v<version>.zip`.
3. Paste listing copy + permission justifications from `STORE_LISTING.md`.
4. Privacy tab: privacy policy URL `https://videolens.io/privacy`, fill data disclosures per `STORE_LISTING.md`. Version 0.3.0 adds account PII, managed processing, optional cloud reports, and optional `videolens.io` host access; do not reuse the v0.2 declarations unchanged.
5. Add localized store listings for Simplified Chinese, Traditional Chinese, Latin American Spanish, Romanian, and Hindi using the matching `STORE_LISTING_*.md` files.
6. Upload at least one screenshot (1280×800) and the required small promo tile (440×280); use localized screenshots for localized listings.
7. Distribution: public, all regions, mature content off.
8. Submit for review. Do not advertise a Web Store install link until Google approves and publishes the item.

## 3. After approval

- Put the real Chrome Web Store URL on the site (`#extension` section has a disabled "coming soon" button with id `cws-link`).
- Announce: README badge, GitHub release, socials.

## 4. Firefox Add-ons

1. Register or sign in at https://addons.mozilla.org/developers/.
2. Create a new extension and upload `releases/firefox/videolens-firefox-v<version>.zip`.
3. If Mozilla requests source code, upload
   `releases/firefox/source/videolens-firefox-source-v<version>.zip` only in the
   separate source-code field. Never use the source archive as the add-on package.
4. Select Firefox desktop; the extension requires Firefox 142 or newer.
5. Use the Chrome listing copy as the editorial base, but describe Firefox's native sidebar instead of Chrome's Side Panel.
6. Match the manifest disclosures: authentication information, browsing activity, and website content are required for analysis; personally identifying information is optional and requested only when connecting Pro.
7. Provide the privacy policy URL `https://videolens.io/privacy`, the public source repository, and reviewer notes explaining the direct-to-OpenAI Private path and optional managed path.
8. Submit for review. Add a Firefox install link to the website only after Mozilla approves and publishes the listing.

## Version bumps

Bump `version` in `extension/package.json`, `extension/public/manifest.json`,
`extension/manifest.firefox.json`, and `extension/release-tracker.json`. Reset both
browser entries in the tracker to the appropriate pre-submission state, then run
`npm run release:check`.

Update `release-tracker.json` when each package is submitted, approved, and published.
An extension release is not complete until the target version is published in both
stores. Chrome and Firefox then auto-update installed users independently according
to their store rollout schedules.
