# VideoLens 0.5.1 — activation and continuity

Chrome and Firefox share this release. Store approval and publication are tracked separately in `release-tracker.json`.

- Refresh managed access when returning to the extension after checkout, with a manual refresh option.
- Offer Pro and free Private/BYOK continuations after the managed starter report.
- Save reports locally before server completion and preserve the report through a checkout/sidebar restart.
- Prevent duplicate analysis starts; show actionable failure guidance and confirm allowance recovery only after the server acknowledges it.
- Save a video-based recipe draft before optional online research; open the draft reader while lookup continues.
- Promote both browser editions on the website, with Firefox-aware install buttons and `/firefox`.
- Confirm checkout from authenticated server entitlements, with bounded polling instead of trusting the return URL.
- Record content-free managed-service milestones and expose administrator-only 30-day counts. No BYOK telemetry or report content is collected by these milestones.

Validation: `npm run release:check` passes (75 extension tests, both browser packages, Firefox lint with zero errors/warnings/notices). Site validation passes (85 tests, typecheck, build, SEO audit). Transactional database checks cover starter failure, Pro completion, deduplication and restricted privileges; all synthetic records are rolled back.

Limits: payment/subscription transitions are tested with deterministic Stripe fixtures; no live purchase was made. This release adds no new real-video or kitchen-trial claims. New activation counts begin at deployment and are not a historical cohort conversion rate. Pro report counts include complimentary access; subscription activation is not confirmed revenue.

Rollback: deploy the previous site code and use the prior extension artifacts. The additive activation table/trigger is compatible with 0.5.0; old report records and local libraries are unchanged.
