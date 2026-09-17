# Hosted and browser feature alignment

The hosted Python app and the Chrome/Firefox packages have separate deployment
lifecycles. Public website copy uses stable store URLs and feature names, without
pinned browser version numbers. Internal release trackers keep exact versions.
`npm test` rejects browser `softwareVersion` and version headings on public install
pages. This needs no store scraping job or scheduled version edits.

## Hosted workflows

- Detailed report, key insights, interview/podcast and specialized modes remain.
- `?workflow=recipe` creates cooking recipes with independent ingredient/amount,
  timing and temperature evidence. No online recipe research is performed by the
  hosted workflow; the UI and exports say so. Browser optional research is separate.
- `?workflow=procedure` (also `tutorial`) creates software procedures with sourced
  actions/settings, prerequisites, success checks, gaps and session checklists.
- Both new workflows use YouTube/local files and at most 120 timestamp-accurate
  frames; Procedure combines even coverage with transcript-guided sampling.
- Reports survive JSON/cache serialization and export to HTML/PDF/Markdown/JSON.
  Unsupported content fails clearly instead of fabricating a structured report.
- Hosted processing uses the user's key held in server session memory. Uploads
  and cache are isolated in a temporary directory per server session and cleaned
  when it is released. Downloads preserve reports beyond the session.
- Managed analysis, persistent local library and opt-in account cloud uploads
  remain browser-extension features. The app links to both stores and the cloud
  library; it does not pretend to implement account sync itself.

## Keeping contracts aligned

The hosted prompts are copied from `site/shared/recipe.ts` and `procedure.ts` by
`python3 scripts/sync-hosted-prompts.py`. The generated JSON ships in the Python
wheel. A Python regression test compares it with the shared browser instructions;
CI fails if those instructions change without syncing the hosted copy. Hosted
normalizers independently validate provenance, bound timestamps to observed
segments, and never accept model-invented research sources.

Extension impact: this release changes Python and website surfaces only. It does
not modify shared browser code or the submitted Chrome/Firefox packages. Existing
dual-store release gates remain tracked in `extension/release-tracker.json`.

Validation includes malformed/unsupported evidence, HTML escaping, complete
exports (including actual PDF rendering), Streamlit workflow/checklist interaction,
real ffmpeg extraction with controlled model responses and cache replay, existing
Python regressions, and the website typecheck, SEO audit and tests. Controlled
responses validate plumbing; they are not a new real-model quality evaluation.
