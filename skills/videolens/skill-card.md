## Description: <br>
Turn YouTube videos, local files, and supported video URLs into professional written reports grounded in transcript, visual, OCR, and timestamped evidence. <br>

This skill is ready for commercial and non-commercial use. <br>

## Publisher: <br>
[shadoprizm](https://clawhub.ai/shadoprizm) <br>

### License/Terms of Use: <br>
MIT-0 <br>

## Use Case: <br>
Create detailed reports, key-insight summaries, tutorial guides, interview briefs, meeting notes, bug reports, UX reviews, privacy reviews, content critiques, product-demo analyses, and production recipes from video. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: Local analysis sends selected media evidence and prompts to OpenAI using the user's API key. <br>
Mitigation: Keep the key in trusted OpenClaw configuration, review sensitive sources before use, and use the privacy mode as assistance rather than a guarantee. <br>
Risk: Analysis spends model/API credits. <br>
Mitigation: The runner refuses analysis unless `allow_credit_spend` is explicitly true and bounds cost-control parameters. <br>
Risk: The wrapper downloads and executes the open-source VideoLens runtime. <br>
Mitigation: Version 1.1.0 pins a tested Git commit, verifies the repository origin, and refuses to overwrite a modified managed runtime. <br>

## Reference(s): <br>
- [VideoLens](https://videolens.io) <br>
- [VideoLens for Chrome](https://videolens.io/chrome) <br>
- [VideoLens source repository](https://github.com/shadoprizm/videolens) <br>
- [ClawHub release page](https://clawhub.ai/shadoprizm/skills/videolens) <br>

## Skill Output: <br>
**Output Type(s):** [html, markdown, json, status metadata, local file paths] <br>
**Output Format:** [Standalone HTML report, Markdown report, structured JSON analysis] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Each run writes artifacts under the OpenClaw/OCC data directory.] <br>

## Skill Version(s): <br>
1.1.0 <br>

## Ethical Considerations: <br>
Verify consequential findings against cited source moments, respect source access rights, and do not treat automated privacy or compliance review as exhaustive. <br>
