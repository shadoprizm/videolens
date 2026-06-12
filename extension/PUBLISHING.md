# Publishing runbook — VideoLens Pro

End-to-end: Lemon Squeezy → wiring → build → Chrome Web Store.

## 1. Lemon Squeezy (one-time, ~20 min)

1. Create a store at lemonsqueezy.com (e.g. `videolens`).
2. Products → New product: **VideoLens Pro**, $29, one-time purchase.
3. On the product's variant: enable **License keys**, set **activation limit = 3**.
4. Collect three values:
   - **Checkout URL** — Share → copy the buy link (`https://<store>.lemonsqueezy.com/buy/<variant-uuid>`)
   - **Store ID** — Settings → Stores
   - **Product ID** — on the product page URL
5. Suggested store settings: enable the 14-day refund policy mentioned on the site; customize the receipt email — the license key is included automatically when license keys are enabled.

## 2. Wire the IDs into the code

Replace the placeholders (all greppable via `REPLACE_WITH_VARIANT_UUID`):

- `extension/src/lib/config.ts` → `LEMON.storeId`, `LEMON.productId`, `LEMON.checkoutUrl`
- `site/index.html` → the Buy button href in the `#extension` section

Then rebuild (`npm run build`) and redeploy the site.

## 3. Build & verify

```bash
cd extension
npm install
npm run typecheck
npm run package          # → extension/videolens-extension.zip
```

Manual smoke test before every submission:
1. `chrome://extensions` → Developer mode → Load unpacked → `extension/dist`
2. Open a YouTube video with captions → click the VideoLens icon → Settings → save your OpenAI key → run a **General** analysis. Expect: captions found, frames captured, report with timestamped findings.
3. Run a **Local file** analysis on a short mp4. Expect: transcription + frames.
4. Exhaust the trial (3 runs) → paywall appears → activate with a real license key (create a test discount code of 100% in Lemon Squeezy to get a free key) → PRO badge appears, analysis unlocked.
5. Settings → Deactivate → trial/locked state returns.

## 4. Chrome Web Store

1. One-time: register at https://chrome.google.com/webstore/devconsole ($5).
2. New item → upload `videolens-extension.zip`.
3. Paste listing copy + permission justifications from `STORE_LISTING.md`.
4. Privacy tab: privacy policy URL `https://videolens.io/privacy.html`, fill data disclosures per `STORE_LISTING.md`.
5. Upload screenshots (1280×800).
6. Submit for review. First review typically takes 1–5 business days; `scripting` + host permissions usually trigger a manual review pass.

## 5. After approval

- Put the real Chrome Web Store URL on the site (`#extension` section has a disabled "coming soon" button with id `cws-link`).
- Announce: README badge, GitHub release, socials.

## Version bumps

Bump `version` in **both** `extension/package.json` and `extension/public/manifest.json`, rebuild, upload the new zip. The store auto-updates installed users within hours.

## Support

- Refunds: Lemon Squeezy dashboard → Orders → Refund (14-day policy).
- "License not working": check Orders → the key → activation count; deactivate stale instances from the dashboard if a user hit the 3-device limit.
