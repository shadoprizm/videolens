import type { Analysis, QaEntry } from "./types";

export const DEMO_ANALYSIS: Analysis = {
  source: {
    sourceType: "local_file",
    title: "Sample report: Building products people actually use",
    url: null,
    durationSeconds: 842,
    limitations: [],
  },
  mode: "key_insights",
  prompt: "Extract the most important ideas, evidence, and practical takeaways.",
  summary:
    "The speaker argues that early products should optimize for repeated use, not premature monetization. The strongest signal is whether a specific user returns to solve the same problem without being prompted. The recommended process is to define one clear job, watch real users attempt it, and improve the moments where they hesitate or abandon the workflow.",
  timeline: {
    segments: [
      { start: 18, end: 52, sceneType: "talking head", transcript: "A product starts with a repeated problem, not a pricing page.", ocr: [], visualSummary: "Speaker introduces the central premise.", confidence: "high" },
      { start: 154, end: 206, sceneType: "presentation", transcript: "Return usage is the clearest early signal.", ocr: ["Activation → Value → Return"], visualSummary: "Three-stage product loop shown on screen.", confidence: "high" },
      { start: 388, end: 451, sceneType: "screen demo", transcript: "Watch where people stop and ask why.", ocr: ["Observe behavior, not intent"], visualSummary: "Session replay highlights a stalled workflow.", confidence: "high" },
      { start: 716, end: 778, sceneType: "presentation", transcript: "Charge only after the value is obvious and repeatable.", ocr: ["Useful → Repeated → Paid"], visualSummary: "Closing framework summarizes the sequence.", confidence: "high" },
    ],
  },
  findings: [
    {
      finding: "Repeated use is a stronger early product signal than stated interest.",
      evidence: [
        { timestamp: 18, detail: "The speaker frames the product around a problem that recurs, rather than a feature or pricing model." },
        { timestamp: 154, detail: "A three-stage loop—activation, value, return—is presented as the core measurement framework." },
      ],
      confidence: "high",
    },
    {
      finding: "Observation reveals product friction that interviews routinely miss.",
      evidence: [
        { timestamp: 388, detail: "A session replay example shows the user pausing where the team expected the next action to be obvious." },
      ],
      confidence: "high",
    },
    {
      finding: "Monetization should follow a reliable value loop, not substitute for one.",
      evidence: [
        { timestamp: 716, detail: "The closing framework explicitly orders the stages as useful, repeated, then paid." },
      ],
      confidence: "high",
    },
  ],
  recommendations: [
    { recommendation: "Choose one primary job for the next release.", rationale: "A narrow promise makes repeat usage and abandonment measurable.", confidence: "high" },
    { recommendation: "Watch five users complete the workflow without coaching.", rationale: "Record hesitations, failed expectations, and the moment each user first receives value.", confidence: "high" },
    { recommendation: "Measure report completion and a second analysis within seven days.", rationale: "These events approximate whether the product delivered enough value to return.", confidence: "medium" },
  ],
  tasks: [
    { title: "Define the single-sentence job to be done", detail: "Write the user, situation, desired outcome, and what the current alternative is." },
    { title: "Schedule five unmoderated usability sessions", detail: "Use the current product and avoid explaining the interface during the attempt." },
    { title: "Add activation and return-use measurement", detail: "Track only the minimum events needed to evaluate the product loop." },
  ],
  limitations: ["This sample demonstrates VideoLens report structure and export quality; it is not an analysis of the page currently open."],
  confidence: "high",
};

export const DEMO_QA: QaEntry[] = [
  {
    question: "What should the team measure first?",
    answer: "Start with successful report completion, then measure whether the same person creates another report within seven days. The framework at [02:34] treats return behavior as the strongest early proof that the workflow solved a recurring problem.",
  },
];
