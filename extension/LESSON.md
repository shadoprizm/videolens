# Create a Lesson — 0.7.0

Create a Lesson is a new extension mode for educational explanations and demonstrations. Chrome and Firefox share the same schema, generation, validation and study reader. YouTube captions and sampled frames, or local-file transcription and frames, supply the evidence. Generic tab videos may have less evidence. The hosted Python creation workflow does not yet offer this mode; website account readers support saved lessons.

The lesson contains measurable objectives, prerequisites, optional readiness questions, guided modules with explanations and worked examples, milestones, checkpoint questions, a final application challenge, review prompts and source gaps. Questions include supporting timestamps, hints, answers, explanations and success criteria. Every objective must have an assessment. Generated examples are labeled; missing teaching is not filled with outside facts. This is a study aid, with self-assessment rather than automated grading or verified mastery.

Responses, answer/hint visibility and review marks save in browser localStorage. Extension sidebar and full reader use the same report scope. Website progress is scoped by account and report. A fingerprint of normalized lesson content resets stale progress when the lesson changes. Responses are capped at 12,000 characters per question. Storage failures are disclosed. Progress is not part of the cloud report, report backup, or cross-device sync; clearing browser data removes it. Reset study progress clears that lesson's responses and review marks.

Download Student worksheet produces script-free, printable HTML containing the teaching and questions but excludes answers, hints, explanations of answers, and rubrics. Download Answer key includes answers and success criteria. Existing full-report HTML, Markdown and JSON exports include lesson answers. Browser print can save either dedicated document as PDF.

## Validation

- Extension tests exercise synthesis, unsupported input, objective coverage, unique IDs, evidence bounds, escaping, worksheet answer exclusion, progress scoping, local save/search/backup and the compiled sidebar flow.
- Site tests cover cloud normalization, response exclusion, invalid evidence and shared rendering.
- Eight controlled scenarios through the live synthesis model cover conceptual teaching, arithmetic, corrections, a sales pitch, music, prompt injection, silent diagrams and a cropped formula. One network failure was retried; a JSON-escaping false positive in the cropped-formula checker was corrected after manual review.
- Two downloaded YouTube trials used shipping sampling, specialized lesson vision, timeline and synthesis: Google Sheets freezing with captions (35 frames), and Excel drop-down creation without captions (13 frames). All 48 frames were analyzed. Provider-reported cost totaled $0.371677; this is a small evaluation, not a pricing promise. Native browser capture and learning outcomes were not evaluated.
- Interactive browser verification covers 390px layout, response/checkpoint persistence after reload, separate account/report scopes, stale-content reset and storage failure notices.

Reproduce controlled evaluation with `node --env-file=../site/.env.evaluation.local scripts/evaluate-lesson-evidence.mjs OUTPUT_DIR`. Use `EVAL_CASE=concept` to run one case. Reproduce a downloaded video with `scripts/evaluate-lesson.mjs VIDEO OUTPUT_DIR [CAPTIONS_JSON3] [INFO_JSON]` and the same environment-file option. Credentials are private and excluded from artifacts. Source-video files and evaluation outputs are not packaged.

Release checks use `npm run release:check`, which builds and packages both browsers and lints Firefox. Store publication is tracked separately in `release-tracker.json`; passing checks does not mean either store has published the update.
