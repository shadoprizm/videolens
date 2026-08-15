# Publishing runbook — VideoLens

The extension is part of the free, open-source VideoLens product, with no license or purchase flow. The
Lemon Squeezy checkout never got fully wired up and was pulled out of the
codebase (`extension/src/lib/license.ts`, `LEMON`/`TRIAL_ANALYSES` in
`config.ts`, and the license/paywall UI in `sidepanel/main.ts`). If a paid
future business model is intentionally undecided; this runbook only covers building and publishing
the current extension. Version 0.2.0 is the first package intended for Chrome Web Store review.

## 1. Build & verify

```bash
cd extension
npm install
npm run typecheck
npm run package          # → extension/videolens-extension.zip
```

Manual smoke test before every submission:
1. `chrome://extensions` → Developer mode → Load unpacked → `extension/dist`.
2. Confirm the first-run disclosure appears before Settings can be opened. Accept it, then use Settings → Review disclosure to confirm it can be revisited.
3. Open a YouTube video with captions → click the VideoLens icon → Settings → save your OpenAI key → run a **Detailed report** analysis. Expect: captions found, frames captured, report with timestamped findings.
4. Run a **Local file** analysis on a short mp4. Expect: transcription + frames.
5. Download the self-contained HTML report, open it, and verify the complete report is styled correctly without a network connection.
6. Click **Print / Save PDF**, choose Chrome's **Save as PDF**, and visually inspect every page.
7. Run several analyses back-to-back and confirm there's no trial limit or lockout.

## 2. Chrome Web Store

1. One-time: register at https://chrome.google.com/webstore/devconsole, accept Google's developer terms, and pay the fee shown by Google.
2. New item → upload `videolens-extension.zip`.
3. Paste listing copy + permission justifications from `STORE_LISTING.md`.
4. Privacy tab: privacy policy URL `https://videolens.io/privacy.html`, fill data disclosures per `STORE_LISTING.md`.
5. Upload at least one screenshot (1280×800) and the required small promo tile (440×280).
6. Distribution: public, all regions, mature content off.
7. Submit for review. Do not advertise a Web Store install link until Google approves and publishes the item.

## 3. After approval

- Put the real Chrome Web Store URL on the site (`#extension` section has a disabled "coming soon" button with id `cws-link`).
- Announce: README badge, GitHub release, socials.

## Version bumps

Bump `version` in **both** `extension/package.json` and `extension/public/manifest.json`, rebuild, upload the new zip. The store auto-updates installed users within hours.
