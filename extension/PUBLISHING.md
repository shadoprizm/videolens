# Publishing runbook — VideoLens

The extension has a permanent free Private / BYOK mode and an optional Pro / Managed mode. Free calls
OpenAI directly with the user's key. Pro uses a VideoLens account, a server-managed report allowance,
and optional cloud report storage. Version 0.2.0 was the first Web Store submission; version 0.3.0
introduces the Pro account and therefore requires updated privacy disclosures and optional-host review.

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
3. Open a YouTube video with captions → click the VideoLens icon → Settings → save your OpenAI key → choose **Private** → run a **Detailed report** analysis. Expect: captions found, frames captured, report with timestamped findings.
4. Run a **Local file** analysis on a short mp4. Expect: transcription + frames.
5. Download the self-contained HTML report, open it, and verify the complete report is styled correctly without a network connection.
6. Click **Print / Save PDF**, choose Chrome's **Save as PDF**, and visually inspect every page.
7. Confirm Private mode has no VideoLens limit or lockout.
8. Choose Pro → connect a passwordless account in the browser tab → approve the extension → return to the side panel. Confirm the entitlement appears.
9. Run one managed report with cloud saving off. Confirm no API key is required and usage advances by one.
10. If a test allowance is available, run with cloud saving on and confirm the report appears at `https://videolens.io/account` and can be deleted.
11. Disconnect Pro and confirm the local account token is removed and Private mode still works.

## 2. Chrome Web Store

1. One-time: register at https://chrome.google.com/webstore/devconsole, accept Google's developer terms, and pay the fee shown by Google.
2. New item → upload `videolens-extension.zip`.
3. Paste listing copy + permission justifications from `STORE_LISTING.md`.
4. Privacy tab: privacy policy URL `https://videolens.io/privacy`, fill data disclosures per `STORE_LISTING.md`. Version 0.3.0 adds account PII, managed processing, optional cloud reports, and optional `videolens.io` host access; do not reuse the v0.2 declarations unchanged.
5. Upload at least one screenshot (1280×800) and the required small promo tile (440×280).
6. Distribution: public, all regions, mature content off.
7. Submit for review. Do not advertise a Web Store install link until Google approves and publishes the item.

## 3. After approval

- Put the real Chrome Web Store URL on the site (`#extension` section has a disabled "coming soon" button with id `cws-link`).
- Announce: README badge, GitHub release, socials.

## Version bumps

Bump `version` in **both** `extension/package.json` and `extension/public/manifest.json`, rebuild, upload the new zip. The store auto-updates installed users within hours.
