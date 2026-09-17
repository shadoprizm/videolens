# Procedure evaluation — 17 September 2026

Ten real software videos produced structured procedures. All 1,090 sampled frames
received observations. Eight separate controlled synthesis cases passed. These are
completion and targeted evidence checks, not a measured accuracy rate or proof
that a person can complete every procedure without returning to the video.

## Method

Downloaded videos were sampled with the shipping 120-frame budget and caption
cues where English captions were available (six of ten videos). Frames had a
maximum edge of 1280 pixels. Shipping vision, timeline, synthesis, normalization
and export code ran through the configured `gpt-5.6-terra` models via Vercel AI
Gateway. This bypasses native extension capture and the managed account endpoint.
It does not measure browser permissions, video seeking reliability, transcription
of local audio, user completion, or current application compatibility.

Every video received a manual spot review against source-frame contact sheets,
focusing on ranges, menus, shortcuts, settings and missing interactions. This was
not an exhaustive frame-by-frame audit of every generated statement.

The first pass exposed excess inventories of visible options and a proposed
action based only on an available button. Instructions were tightened to keep
uncertain actions unknown, limit gaps to material omissions and reduce irrelevant
details. All ten videos were synthesized again from their cached observations
with the final instructions. Intermediate results and media stay outside Git.

## Corpus and findings

| Source | Final steps | Spot-review finding |
| --- | ---: | --- |
| [Microsoft Excel dropdown](https://www.youtube.com/watch?v=-02SsHDW2lQ) | 7 | B2:B10, Cities!A1:A14, the exact absolute source formula, List and Enter/OK retained. Workbook setup remains a prerequisite/gap. |
| [Earlier Microsoft Excel dropdown](https://www.youtube.com/watch?v=udv5tffwEX0) | 6 | Same range/reference retained without captions; Boston and Chicago match the visible demonstration. |
| [VS Code color customization](https://www.youtube.com/watch?v=w2dXlvPw3qQ) | 9 | Keyboard chords and demonstrated hex values retained; changing examples are distinguished. The full final settings object and unlabeled settings control remain unclear. |
| [VS Code theme extensions](https://www.youtube.com/watch?v=vtRH7E5Shhc) | 9 | Install sequence and Ctrl+K, Ctrl+T retained without captions. An unconfirmed Bearded variant is an unknown step; cropped searches remain explicitly partial. |
| [Google Sheets freeze methods](https://www.youtube.com/watch?v=31WnIJJnr0w) | 7 | Up to row 3, Up to column A, reset and drag alternatives retained. Exact drag endpoint remains uncertain. |
| [Google Sheets short freeze guide](https://www.youtube.com/watch?v=Bgl54vaoR1s) | 4 | Short visual-only guide retains View > Freeze and the demonstrated one-row choice. |
| [Canva manual resize, Spanish UI](https://www.youtube.com/watch?v=93wlRA8UKzc) | 13 | Original UI labels and copy/paste shortcuts retained without captions. Destination creation is unknown, rather than invented from the hovered format. |
| [Canva resize options](https://www.youtube.com/watch?v=zI-GBMMhQAQ) | 10 | 1000 × 2000 px canvas and narrated Pro/manual alternatives retained. The 1920 × 1080 selection interaction remains unknown. Exact manual layout is not reproducible. |
| [Microsoft Word tables](https://www.youtube.com/watch?v=QbbprkeJbLM) | 5 | Grid, dialog, text-conversion and drawing branches remain separate. Table counts and Tabs retained; the unreadable style name is unknown. |
| [Chrome default search](https://www.youtube.com/watch?v=E9F9EXwEXLU) | 6 | Settings > Search engine > Change and Set as default retained, with the visible confirmation as a check. No custom-engine setup invented. |

## Cost and limits

The initial ten complete passes used 375 provider requests and cost $6.4454 in
provider-reported usage: approximately $0.25–$0.96 per video (mean $0.64).
The final ten synthesis-only reruns cost an additional $0.7536, and the eight
controlled cases cost $0.0637. Total evaluation usage was approximately $7.26.
These are observed test costs, not pricing guarantees, and exclude transcription,
hosting, retries beyond these runs, and payment costs. Review managed-plan margins
before expanding usage: dense software frames can cost more than ordinary summaries.

Remaining limitations include occasional verbose details, incomplete tutorials,
cropped or transient text, model mistakes, unknown software versions, and uncertain
drag/selection interactions. A timestamp establishes where evidence was supplied;
it does not independently prove the model interpreted that evidence correctly.
Long tutorials and live native-browser capture need broader user trials.

The illustrative website example is intentionally separate from this corpus.
Machine-readable counts and source URLs are in `procedure-results.json`.
