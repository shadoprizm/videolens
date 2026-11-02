# Failed-scan follow-up — November 1, 2026

## Scope and evidence

Reviewed every retained failed managed report, its AI request outcomes, the
existing fixes, current GitHub main, Vercel deployment metadata, Railway's active
deployment, and retained Railway application logs. Customer identifiers, source
URLs, recording contents, and credentials are excluded from this public record.

The initial inventory contained 24 failures, all created before the October 31
sound-review deployment. Historical rows are preserved after a repair; their
presence does not establish a failure of the current version.

| Category | Reports | Finding and status |
| --- | ---: | --- |
| Sound processing | 7 | Six deadlines and one invalid provider response. PRs #44, #50 and #53 changed deadlines, bounded retries and review batching. The four October 31 deadlines preceded #53. Invalid acoustic evidence still fails closed rather than becoming a fabricated observation. |
| Interrupted | 4 | Two abandoned reservations without AI requests, one with 14 successful AI requests, and one with 21 successful requests. Idle recovery and the hosted interruption handler release allowance. The exact historical disconnect/rerun trigger is not retained. Continued processing across browser-session loss is not established. |
| YouTube source | 3 | Retained Railway logs correlate all three attempts with YouTube's sign-in/bot rejection before AI processing. The client was pinned to embedded extraction. These are separate from sound processing. |
| Older, insufficient detail | 10 | Nine have no AI requests; one predates per-request outcomes. The retained evidence cannot establish a precise original client cause. Do not relabel these as proven provider timeouts or claim every historical cause is fixed. |

## Fresh production acceptance

Before new changes, both the website and hosted app were running commit
`32dad4799c377a3ef0aaab8ff34cfa845125ee25` from PR #53. Vercel deployment
`dpl_AuLY81tbdojr8qYFxGJs2NQ371oM` was READY and assigned to videolens.io.
Railway deployment `32572cdd-8e1c-41c6-841d-79e08e7e3102` was active and successful.

A native Chrome upload of a synthetic 68-second blue-screen/tone fixture completed
through the authenticated production hosted app in 109.3 seconds: 14 visual
frames, 34 sound windows over two consecutive chunks, nine AI operations and zero
failed operations. Database completion was read back. The report correctly
limited its claims to the synthetic blue screen and provisional tone evidence.
This closes the earlier native-browser upload acceptance gap for this workload.
An automated JSON-download event was not observed; export acceptance is not
claimed by this test.

A separate 19-second public YouTube control still failed at source download with
no AI requests; its allowance was restored. This reproduces a remaining source
access issue independently of the historical screenshots.

All 249 site/API tests, typecheck, build and SEO checks passed before new changes.
Thirty focused Python checks covering managed requests, sounds, downloads and
the hosted UI passed.

## Source repair and limits

The downloader now asks for the token-enabled `mweb` client as well as the
embedded client, following [yt-dlp's PO-token guidance](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide).
This removes the embedded-only restriction. Access-denied copy accurately
describes server download refusal and offers upload or browser analysis instead
of implying that every refusal means embedding was disabled.

This configuration does not guarantee access to videos that require a signed-in
session or are blocked from the server's IP. Provider documentation explicitly
states that PO tokens cannot guarantee removal of IP-based sign-in restrictions.
Do not introduce account cookies, purchased proxies, or another processing
provider without a separate reviewed decision. Keep failure history and restore
allowance when source access or verified processing cannot complete.

The full Python suite passed after the source change (76 tests). Deployment and
post-deployment source acceptance are tracked in [PR #54](https://github.com/shadoprizm/videolens/pull/54).
A source configuration change must not be described as a verified end-to-end fix
unless that production retest passes.

Extension impact: hosted downloader and documentation only; no extension code,
permissions, package versions or processor destinations change.
