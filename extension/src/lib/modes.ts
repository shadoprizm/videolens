// Ported verbatim from src/videolens/analysis/modes/*.py — keep in sync.
import type { AnalysisMode } from "./types";

export interface ModePrompts {
  label: string;
  instructions: string;
  summary: string;
  findings: string;
  recommendations: string;
  tasks: string;
  defaultPrompt: string;
}

export const MODE_PROMPTS: Record<AnalysisMode, ModePrompts> = {
  general: {
    label: "General",
    instructions: `You are reviewing a video by reading a structured timeline (frames + transcript).
Answer the user's prompt with evidence-grounded analysis. Distinguish what is
directly observed from what is inferred. Be specific, terse, and concrete.

For each finding, cite at least one timeline timestamp as evidence. Confidence
levels:
- high   = directly visible or clearly spoken
- medium = strongly implied by behaviour or context
- low    = possible but not confirmed`,
    summary: "A 2–4 sentence executive summary of what happens in the video.",
    findings:
      "3–6 notable findings: what is visible, what stands out, what's worth knowing. " +
      "Each finding must include at least one evidence entry pointing at a timestamp.",
    recommendations:
      "If the user's prompt invites recommendations, provide 0–4 concrete suggestions. " +
      "Otherwise return an empty list.",
    tasks: "0–4 follow-up tasks an agent could action. Empty list is fine.",
    defaultPrompt: "What happens in this video? Summarize the key moments.",
  },
  bug: {
    label: "Bug report",
    instructions: `You are reviewing a bug recording. Read the timeline (frames + transcript) and
identify the bug, the steps that reproduced it, and the visible failure mode.

Be precise about timestamps. Cite specific frames where error messages, broken
UI, or unexpected behaviour appear. Distinguish directly-observed facts from
inferences about root cause.`,
    summary:
      "2–4 sentences: what the user was doing, what went wrong, and the visible " +
      "failure mode (error text / crash / wrong output).",
    findings:
      "Findings should cover: observed issue, expected vs actual behaviour, " +
      "visible error messages, environment hints (browser/OS/app), possible root " +
      "cause areas. Cite timestamps as evidence.",
    recommendations:
      "Provide a clean numbered list of reproduction steps and a severity hint " +
      "(blocker / major / minor / cosmetic). These belong in the recommendations field.",
    tasks:
      "Tasks should read like ticket bullet points: a ticket-ready summary, " +
      "investigate root cause in X file/system, write regression test, etc.",
    defaultPrompt: "Identify the bug shown, the repro steps, and the failure mode.",
  },
  meeting: {
    label: "Meeting",
    instructions: `You are reviewing a meeting recording (call, briefing, sync). Read the timeline
(transcript with diarized speakers where available, plus frame snapshots) and
extract decisions, objections, commitments, and follow-up actions.

Stay grounded in what was actually said. Attribute statements to speakers when
diarization is present. If a speaker is not labelled, say so.`,
    summary:
      "2–4 sentences: who met (where attributable), what was discussed, and the " +
      "main outcome or open question.",
    findings:
      "Findings should cover: key discussion points, decisions reached, concerns " +
      "or objections raised, commitments made (who/what/by-when when stated), " +
      "and open loops. Cite timestamps as evidence.",
    recommendations:
      "Recommendations are next-step suggestions on items the meeting did not " +
      "close, framed for the person reviewing this summary. 0–4 items.",
    tasks:
      "Concrete follow-up actions, ideally with an owner (when stated in the " +
      "meeting). Each task should be one bullet a project tracker could ingest.",
    defaultPrompt: "Extract decisions, commitments, objections, and follow-up actions.",
  },
  ux: {
    label: "UX review",
    instructions: `You are reviewing a session replay or screen recording of a user interacting
with a product. Read the timeline (frames + transcript) to infer the user's
intent, identify friction, and recommend changes that would make the flow
easier or clearer.

Pay attention to: repeated actions, long pauses on a single screen, scrolling
back and forth, abandoned flows, clicks that produce no obvious feedback,
inputs that get cleared or rejected. Distinguish what is directly observed
from what is inferred about the user's state.`,
    summary:
      "2–4 sentences: what the user appeared to be trying to do, the strongest " +
      "friction point, and whether they completed or abandoned the flow.",
    findings:
      "Findings should cover: likely user intent, friction points (each tied to " +
      "a timestamp), confusion indicators (pauses, repeats, abandoned attempts), " +
      "and UI/copy that misled or under-served the user. Every finding cites at " +
      "least one timestamp as evidence.",
    recommendations:
      "Concrete UI/copy/flow changes that would address the observed friction. " +
      "Prefer specific wording or layout suggestions over generic 'improve UX' " +
      "advice. 2–5 items.",
    tasks:
      "Actionable changes a designer or PM could file: 'Change CTA copy on /pricing " +
      "from X to Y', 'Add inline validation to the password field', etc. Keep each " +
      "one shippable in a single PR.",
    defaultPrompt: "Identify user friction and recommend UX improvements.",
  },
  tutorial: {
    label: "Tutorial",
    instructions: `You are reviewing a tutorial or how-to video. Extract the implementation
steps shown, the tools and commands used, and any prerequisites or
assumptions the tutorial makes. Be precise about the order of operations
and the exact commands/UI clicks demonstrated.

Flag anything that looks outdated, risky, or skipped over (e.g., 'they
copied a command but didn't explain the flag', 'they assume X is already
installed'). The output should be useful as an agent-ready checklist a
developer or AI agent could follow without re-watching the video.`,
    summary:
      "2–4 sentences: what the tutorial teaches, the end-state it produces, " +
      "and the rough level of expertise it assumes.",
    findings:
      "Findings should cover: tools and frameworks used, every command run, " +
      "every configuration shown on screen (with full text via OCR where " +
      "possible), the order of operations, and any assumed prerequisites the " +
      "tutorial does not install or explain. Cite timestamps.",
    recommendations:
      "Missing context, outdated steps, or risky shortcuts the viewer should " +
      "know about before following along. 0–4 items.",
    tasks:
      "An implementation checklist: numbered, agent-ready, one action per item. " +
      "Each task is something you can do without re-watching. Include exact " +
      "commands and file paths from the timeline's OCR data.",
    defaultPrompt: "Extract an agent-ready step-by-step checklist from this tutorial.",
  },
  product_demo: {
    label: "Product demo",
    instructions: `You are reviewing a product demo or marketing video. Build a structured
inventory of what the product does and how it is positioned. Note the
strengths the demo emphasises, the weaknesses or rough edges it accidentally
reveals, and the opportunities a competitor or PM could mine.

Stay grounded in what is shown. If the demo claims something without
showing it (e.g., 'this scales to millions of rows' over a stock animation),
flag that distinction in the findings.`,
    summary:
      "2–4 sentences: what the product is, who it appears to be for, the " +
      "headline value proposition, and the overall production quality of the demo.",
    findings:
      "Findings should cover: feature inventory (every feature shown on screen, " +
      "with timestamp), onboarding and core-loop flow, UI patterns used, " +
      "positioning and messaging strengths, weaknesses or rough edges visible, " +
      "and competitor implications. Cite timestamps for each observation.",
    recommendations:
      "Opportunities a PM or competitor could pursue: features to clone, gaps " +
      "to exploit, positioning angles to test. Frame each as a concrete next move. " +
      "0–5 items.",
    tasks:
      "Ideas worth a deeper investigation or design spike. Each task is one " +
      "trackable item: 'Spec a competitor of feature X', 'Test pricing strategy " +
      "Y on landing page', etc.",
    defaultPrompt: "Inventory the features shown and how the product is positioned.",
  },
  content: {
    label: "Content review",
    instructions: `You are reviewing a video for its craft: clarity, pacing, structure,
persuasiveness, and call-to-action effectiveness. Treat the speaker like a
writer being workshopped — friendly but specific.

Examine the hook (first ~10 seconds), the pacing throughout, transitions,
visual/audio alignment (does what's on screen support what's being said?),
the strength of any claims, the evidence offered for them, and the close /
CTA. Cite specific timestamps for each critique so the creator can find them.`,
    summary:
      "2–4 sentences: what kind of video this is, who the apparent audience " +
      "is, and your overall impression of its effectiveness.",
    findings:
      "Findings should cover: hook quality (does the opening earn attention?), " +
      "pacing issues (sections that drag or rush), unclear segments, visual/audio " +
      "mismatches, unsupported claims or hand-wavy assertions, missing proof or " +
      "examples, and the close/CTA strength. Cite timestamps.",
    recommendations:
      "Specific edits the creator could make: 'cut from 0:42–1:15, the analogy " +
      "doesn't land', 'add a chart at 2:30 to back up the 40% claim', 'rewrite " +
      "the CTA to ask for one specific action'. 2–5 items.",
    tasks: "Discrete revisions the creator could action — each one a single change.",
    defaultPrompt: "Critique the hook, pacing, claims, and call to action.",
  },
  privacy: {
    label: "Privacy scan",
    instructions: `You are reviewing a video for sensitive-information exposure. Treat this
like a security/privacy redaction pass: surface every visible secret,
identifier, internal URL, customer datum, or risky command, no matter how
briefly it appears on screen.

Be thorough and exact. For each finding give the timestamp, the kind of
sensitive content (API key / credential / PII / internal URL / customer
data / etc.), and what the redaction or fix should look like. Err on the
side of flagging too much — false positives are cheap, false negatives are
expensive.`,
    summary:
      "2–4 sentences: an overall risk assessment (low / medium / high), the " +
      "categories of sensitive content exposed, and whether the video is safe " +
      "to share externally as-is.",
    findings:
      "Findings should cover (with timestamps): visible credentials or API " +
      "keys, exposed private URLs / internal dashboards / staging environments, " +
      "customer or employee names and emails, financial figures not meant for " +
      "external eyes, browser tabs revealing other sensitive content, and risky " +
      "shell commands or unredacted SSH/database connection strings. One finding " +
      "per item — do not bundle multiple secrets together.",
    recommendations:
      "Concrete redaction instructions: 'blur frames 0:12–0:18', 'cut the " +
      "section from 1:30 where the .env file is open', 'rotate the API key " +
      "visible at 0:45'. Include any keys/credentials that should be considered " +
      "burned and rotated.",
    tasks:
      "Specific actions before the video can be shared externally. Each task " +
      "is a single redaction or rotation, with the offending timestamp.",
    defaultPrompt: "Find every secret, credential, or PII exposure before I share this.",
  },
};

export const MODE_ORDER: AnalysisMode[] = [
  "general",
  "bug",
  "meeting",
  "ux",
  "tutorial",
  "product_demo",
  "content",
  "privacy",
];
