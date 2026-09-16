# VideoLens release artifacts

Store-ready browser packages are separated by platform so the wrong archive is not uploaded.

- `chrome/videolens-chrome-v<version>.zip` — upload to the Chrome Web Store.
- `firefox/videolens-firefox-v<version>.zip` — upload as the Firefox add-on package.
- `firefox/source/videolens-firefox-source-v<version>.zip` — upload only when Mozilla asks for reviewer source code.

Run `npm run release:check` from `extension/` to rebuild and validate all three current-version artifacts.

The VideoLens website deploys directly from `site/` to Vercel and does not use a release ZIP. This repository currently has no WordPress or Shopify build target.
