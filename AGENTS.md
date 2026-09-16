# VideoLens repository guidance

## Dual-browser extension release contract

- For every user-visible VideoLens upgrade, explicitly assess its extension impact. When extension behavior changes, carry the change through both browser targets in the same release.
- Treat every change under `extension/` as a Chrome and Firefox change unless it is explicitly documented as browser-specific.
- Use the shared source in `extension/src/` and keep browser-specific behavior limited to the manifests, background integration, and unavoidable browser API differences.
- Do not call an extension release complete until the same version has passed `npm run release:check`, has been submitted to both the Chrome Web Store and Firefox Add-ons, and is tracked through publication in `extension/release-tracker.json`.
- Use `npm run build` and `npm run package` as the default commands; both commands intentionally build/package Chrome and Firefox. Use the browser-specific variants only for focused debugging.
