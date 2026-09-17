# Make a Procedure — VideoLens 0.6.0

Tutorial mode now turns software walkthroughs into a reusable procedure: outcome,
software context, prerequisites, ordered actions, exact values, success checks,
missing information and a checklist. YouTube and local video files are supported.
This release changes extension behavior in both Chrome and Firefox through shared source.

## Evidence rules

- Actions and exact values must be demonstrated or spoken in the video and cite
  available timeline evidence. An available control alone is not a demonstrated action.
- Suggested prerequisites and checks have a separate inferred label and rationale.
- Missing actions, cropped commands, unreadable settings and unknown permissions
  stay unknown. The tool does not execute procedures or verify current software behavior.
- Code and settings retain their original spelling across output languages.
  Model instructions request placeholders for credentials and personal data;
  this is not a guarantee of automatic redaction of all source material.
- Non-software material and insufficient software evidence are rejected.

Up to 120 frames are sampled, with even coverage plus caption-guided moments.
Frames are analyzed in groups of three; missing groups are retried once. Reports
disclose missing frames and the limits of sampling. A report fails when fewer than
half of its captured frames can be analyzed. Brief interactions may still be missed.

## Storage and reading

The procedure survives local library saving/search, backup/restore, optional cloud
upload, shared full-page reading, HTML, Markdown and JSON exports. Legacy Tutorial
reports continue to open. Checkboxes are session-only; copy the reusable checklist
to keep progress in another tool. Clipboard failure downloads the checklist instead.

The website's `/procedure-preview` is a clearly labeled illustrative example,
not an extraction from a real source video. The extension feature requires 0.6.0.

## Reproduce evaluation

Install extension dependencies with `npm ci`. For a local video, install FFmpeg
and run from `extension/`:

```sh
node scripts/evaluate-procedure.mjs VIDEO OUTPUT_DIR [CAPTIONS_JSON3] [INFO_JSON]
node scripts/evaluate-procedure-evidence.mjs OUTPUT_DIR
```

Set `OPENAI_API_KEY`, or a supported Vercel AI Gateway credential, in the process
environment. Credentials are never printed. The real-video evaluator caches
observations in its output directory; use a fresh directory when changing vision
or sampling code. A rerun with cached observations measures synthesis only.
Caption files are optional. `FFMPEG_PATH` and `FFPROBE_PATH` override executable
locations. Downloaded source videos and evaluation artifacts remain outside Git.

Eight controlled scenarios cover non-software rejection, static-screen rejection,
cropped commands, unclicked controls, corrected values, unknown plans, injected
captions and secret placeholders. They are model evaluations, not real video tests.

Release validation and real-video findings are recorded in `release-tracker.json`
and `evaluation/procedure-review.md`. Store publication remains a separate release
gate for each browser.
