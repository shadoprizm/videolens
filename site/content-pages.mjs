export const lastmod = "2026-08-15";

export const pages = [
  {
    slug: "ai-video-analyzer",
    title: "AI Video Analyzer with Timestamped Evidence | VideoLens",
    description: "Analyze video with transcription, frame-level vision, OCR, and timestamp citations. VideoLens turns local files and video links into structured, evidence-grounded reports.",
    eyebrow: "Multimodal AI video analysis",
    h1: "An AI video analyzer that shows its evidence.",
    lead: "VideoLens analyzes what is said, what appears on screen, and when it happens. Give it a local video or a supported link, ask a question, and get a structured report with citations to specific moments.",
    summary: [
      "Most AI video tools rely mainly on a transcript. That misses silent interactions, interface state, diagrams, error messages, and other visual evidence. VideoLens combines transcript segments with sampled-frame descriptions and on-screen text recognition before it writes the report.",
      "The result is useful for both review and automation: a human-readable explanation, timestamped findings, recommendations, and machine-readable JSON that an AI agent can consume."
    ],
    benefits: [
      ["Multimodal context", "Combines speech, visual changes, OCR, scene type, and your prompt in a time-windowed timeline."],
      ["Verifiable findings", "Important claims cite timestamps so reviewers can jump back to the source instead of trusting a generic summary."],
      ["Reusable analysis", "Extraction is cached. Ask follow-up questions or switch analysis goals without processing the entire video again."]
    ],
    workflow: [
      "Add a local file or a supported video URL.",
      "Choose an analysis mode and describe what you need to learn.",
      "VideoLens transcribes audio, samples frames, reads visible text, and builds a timestamped timeline.",
      "Review the evidence-grounded report, ask follow-up questions, or export professional HTML, PDF, Markdown, or JSON."
    ],
    deliverables: ["Concise video summary", "Timestamped findings and evidence", "Recommendations and next actions", "Professional HTML, PDF, Markdown, and structured JSON exports"],
    limitation: "VideoLens samples frames rather than interpreting every frame of a video. Results depend on source accessibility, audio and image quality, sampling settings, and the clarity of the question. DRM-protected players and live streams are not supported.",
    faqs: [
      ["Can AI actually understand what is visible in the video?", "VideoLens sends sampled frames to a vision-capable model, records visual descriptions and on-screen text, and merges that evidence with the transcript. It can therefore reason about more than spoken words, while still being limited by frame sampling."],
      ["Does VideoLens work with local video files?", "Yes. Local files are supported by the CLI, web UI, and Chrome extension workflow. Remote sources are supported when the video can be accessed by the resolver or browser capture pipeline."],
      ["Can I ask more questions after the first report?", "Yes. Follow-up questions reuse the cached timeline, making repeated analysis faster and typically much cheaper than extracting the video again."]
    ],
    related: ["screen-recording-analyzer", "video-analysis-mcp", "youtube-video-analyzer"]
  },
  {
    slug: "screen-recording-analyzer",
    title: "AI Screen Recording Analyzer for Bugs and UX | VideoLens",
    description: "Turn screen recordings into timestamped bug findings, reproduction steps, UX friction, and ticket-ready actions using transcript, vision, and OCR evidence.",
    eyebrow: "Bug reports and UX evidence",
    h1: "Turn a screen recording into an actionable report.",
    lead: "VideoLens reviews screen recordings for visible state changes, spoken context, clicks, pauses, error messages, and failed outcomes—then produces findings tied to the moments that support them.",
    summary: [
      "A screen recording often contains the best available evidence of a bug or confusing workflow, but someone still has to watch it, reconstruct the sequence, and write the ticket. VideoLens shortens that review loop.",
      "Use Bug mode for reproduction steps and failure evidence, UX mode for friction and flow recommendations, or a custom prompt when you need a narrower investigation."
    ],
    benefits: [
      ["Reproduction sequence", "Extracts the visible sequence leading to a failure and separates observed behavior from interpretation."],
      ["On-screen error capture", "OCR and frame descriptions preserve messages, labels, disabled states, and other interface evidence."],
      ["Ticket-ready handoff", "Produces a summary, severity hint, evidence citations, recommendations, and concrete follow-up tasks."]
    ],
    workflow: [
      "Upload the screen recording or open the page video in the Chrome side panel.",
      "Choose Bug or UX mode and state the expected outcome.",
      "VideoLens builds a synchronized transcript-and-visual timeline.",
      "Validate each cited moment and export the result into your issue or product workflow."
    ],
    deliverables: ["Observed reproduction steps", "Expected-versus-observed behavior", "Timestamped errors and UI states", "Suggested investigation and remediation tasks"],
    limitation: "VideoLens reviews video evidence; it does not inspect your application code, network trace, console, or backend logs unless that information is visible in the recording or supplied separately. Root-cause suggestions should be treated as investigation leads.",
    faqs: [
      ["Can VideoLens write a bug ticket from a recording?", "It can produce a ticket-ready summary with reproduction steps, observed behavior, timestamped evidence, and suggested tasks. A reviewer should confirm severity, environment, and technical root cause."],
      ["Does it detect text shown briefly on screen?", "It can read text from sampled frames. Increasing the sampling rate improves the chance of capturing brief messages but increases processing cost."],
      ["Can it review UX rather than just bugs?", "Yes. UX mode focuses on friction, pauses, repeated actions, confusing transitions, and recommendations rather than only failure states."]
    ],
    related: ["session-replay-analyzer", "ai-video-analyzer", "loom-video-analyzer"]
  },
  {
    slug: "session-replay-analyzer",
    title: "AI Session Replay Analyzer for Product Teams | VideoLens",
    description: "Analyze PostHog, Hotjar, Clarity, FullStory, LogRocket, and OpenReplay sessions as video evidence. Find friction, failures, and timestamped UX insights.",
    eyebrow: "Session replay review",
    h1: "Find the moments that matter in a session replay.",
    lead: "VideoLens turns an accessible session replay into a time-windowed record of visible behavior, on-screen text, pauses, repeated actions, and outcomes—ready for product, UX, or bug analysis.",
    summary: [
      "Session replay platforms are excellent at collecting evidence, but reviewing individual sessions is still linear work. VideoLens can use supported video sources directly and includes a browser-capture fallback for replay pages that require the rendered experience.",
      "Ask a focused question such as where the user became blocked, which interaction preceded the error, or what friction should be prioritized. The answer cites the replay timeline."
    ],
    benefits: [
      ["Friction detection", "Highlights pauses, repeated actions, reversals, and visible dead ends that suggest uncertainty or broken flow."],
      ["Evidence, not heatmaps", "Explains individual-session behavior with timestamped moments that teammates can review."],
      ["Multiple review modes", "Use UX, Bug, Privacy, or a custom prompt against the same cached extraction."]
    ],
    workflow: [
      "Provide an accessible replay URL or capture the rendered replay in the browser workflow.",
      "Choose the question and analysis mode that match the investigation.",
      "VideoLens samples the replay, reads visible interface text, and builds the timeline.",
      "Review cited friction and convert validated findings into experiments, bugs, or follow-up research."
    ],
    deliverables: ["Timeline of important interactions", "Observed friction and failure moments", "Potential privacy exposures visible in the replay", "Prioritized product follow-up tasks"],
    limitation: "Rendered-video analysis does not replace event-level funnels or complete replay metadata. Authentication, bot protection, canvas rendering, playback controls, and platform changes can affect browser capture. Use the source replay platform for quantitative validation.",
    faqs: [
      ["Which session replay tools can VideoLens work with?", "The browser-capture resolver recognizes PostHog, Microsoft Clarity, Hotjar, FullStory, LogRocket, and OpenReplay pages. Actual capture depends on access and how the replay is rendered."],
      ["Does VideoLens send data back to the replay provider?", "VideoLens opens or captures the replay you provide. Analysis calls go to OpenAI using your key; VideoLens does not operate an analytics database of replay content."],
      ["Can it analyze many sessions automatically?", "The current workflow is strongest for focused qualitative review. Large-scale aggregation and native event-export parsers remain separate product opportunities."]
    ],
    related: ["screen-recording-analyzer", "video-privacy-analyzer", "ai-video-analyzer"]
  },
  {
    slug: "video-analysis-mcp",
    title: "Video Analysis MCP Server for AI Agents | VideoLens",
    description: "Give Claude Code, Cursor, Windsurf, and other MCP clients timestamped video analysis tools with structured JSON, evidence citations, and cached follow-up Q&A.",
    eyebrow: "Video tools for AI agents",
    h1: "Let your AI agent reason over video with MCP.",
    lead: "VideoLens ships a Model Context Protocol server that exposes video resolution, extraction, analysis, report retrieval, and follow-up Q&A as tools an agent can call.",
    summary: [
      "Agents are good at reasoning over text and code, but video is usually an opaque attachment. The VideoLens MCP server converts video into a structured timeline and evidence-grounded analysis that an MCP client can use in a larger workflow.",
      "Because the extraction is cached and the output is structured, an agent can analyze once, ask more questions, and pass findings into issue, documentation, or development workflows."
    ],
    benefits: [
      ["Native agent tool", "Expose video analysis through MCP instead of pasting transcripts or manually describing what happened."],
      ["Structured evidence", "Return machine-readable findings, timestamps, recommendations, and task objects rather than an ungrounded paragraph."],
      ["Local control", "Run the open-source server in your environment with your own OpenAI key and local cache."]
    ],
    workflow: [
      "Install VideoLens and configure your OpenAI API key.",
      "Add the VideoLens MCP server command to a compatible client.",
      "Ask the agent to analyze a local file or supported URL with a mode and prompt.",
      "Let the agent inspect the structured result, ask follow-ups, and use validated findings downstream."
    ],
    deliverables: ["Source metadata and processing status", "Cached timestamped timeline", "Structured analysis with evidence", "Follow-up answers grounded in the same timeline"],
    limitation: "MCP gives an agent tool access; it does not remove the need for permissions, cost controls, source validation, or human review. Treat video content as untrusted input and scope agent capabilities appropriately.",
    faqs: [
      ["Which AI clients can use the VideoLens MCP server?", "Any client that supports standard local MCP servers can potentially use it, including agent-oriented coding tools. Configuration details vary by client."],
      ["Does the MCP server upload my videos to VideoLens?", "No VideoLens account or central video store is involved. The local pipeline processes the source and calls OpenAI with your API key for transcription and vision tasks."],
      ["Can an agent ask follow-up questions without reprocessing the video?", "Yes. Follow-up Q&A operates on the cached timeline, so the expensive extraction work does not need to be repeated."]
    ],
    related: ["ai-video-analyzer", "screen-recording-analyzer", "youtube-video-analyzer"]
  },
  {
    slug: "youtube-video-analyzer",
    title: "YouTube Video Summarizer & Written Report Generator | VideoLens",
    description: "Turn accessible YouTube videos into professional written reports with transcript, sampled frames, OCR, timestamp evidence, and HTML or PDF export.",
    eyebrow: "YouTube videos, turned into useful reports",
    h1: "Turn a long YouTube video into something worth reading.",
    lead: "VideoLens combines the transcript, sampled visual frames, and on-screen text into a structured written report with links back to the exact moments that support it.",
    summary: [
      "Transcript-only YouTube summaries can miss slides, demonstrations, code, charts, captions, and silent changes. VideoLens adds frame-level vision and OCR before it writes the report.",
      "Choose Detailed Report, Key Insights, Tutorial Guide, or Interview / Podcast. Then read it in the app, ask follow-up questions, or export a polished standalone document."
    ],
    benefits: [
      ["Visual-aware summaries", "Include important information that appears on screen but is not said aloud."],
      ["Clickable evidence", "Use timestamps to jump back to the relevant part of the original video."],
      ["Professional artifact", "Open or share a polished standalone HTML report and print the same design as a PDF."]
    ],
    workflow: [
      "Paste an accessible YouTube URL into the hosted app, CLI, or supported extension workflow.",
      "Choose a report style and optionally refine the prompt.",
      "VideoLens retrieves the media, transcribes audio, samples frames, and merges the evidence by time.",
      "Review, question, and export the resulting report."
    ],
    deliverables: ["Executive summary and key findings", "Visual and transcript evidence", "Practical takeaways and follow-up ideas", "Professional HTML, PDF, Markdown, or JSON artifact"],
    limitation: "Availability depends on the source and yt-dlp support. Private, age-gated, region-restricted, removed, live, or DRM-protected content may not be accessible. Respect the rights and terms that apply to the source video.",
    faqs: [
      ["Is VideoLens just a YouTube transcript summarizer?", "No. It combines transcription with sampled-frame descriptions and OCR, which helps when meaning is carried by slides, interfaces, demonstrations, or visible text."],
      ["Can I ask questions about a long YouTube video?", "Yes, within the practical context and cost limits of the pipeline. Sampling, audio chunking, and caching are designed to make longer sources manageable."],
      ["Can I export the result?", "Yes. VideoLens creates a branded standalone HTML report and matching print-quality PDF, plus Markdown and JSON. Follow-up answers can reuse the cached timeline."]
    ],
    related: ["ai-video-analyzer", "video-analysis-mcp", "meeting-video-analyzer"]
  },
  {
    slug: "loom-video-analyzer",
    title: "Loom Video Analyzer for Bugs, Demos, and Handoffs | VideoLens",
    description: "Turn accessible Loom recordings into timestamped bug reports, product-demo findings, tutorial steps, meeting actions, and structured AI-ready exports.",
    eyebrow: "Faster async-video handoffs",
    h1: "Turn a Loom recording into a report your team can act on.",
    lead: "VideoLens analyzes accessible Loom recordings for speech, visual state, and on-screen text, then converts the recording into timestamped findings, recommendations, and tasks.",
    summary: [
      "Loom is frequently used for bug reports, product demos, walkthroughs, design feedback, and async status updates. Those recordings are rich in context but slow to search and difficult to hand off consistently.",
      "VideoLens lets the reviewer choose the job: reconstruct a bug, extract tutorial steps, inventory demo claims, capture meeting decisions, or ask a focused question about the recording."
    ],
    benefits: [
      ["Async handoff", "Convert an informal narrated recording into a structured artifact that is easier to scan and assign."],
      ["Screen-aware evidence", "Capture interface states, labels, visible errors, and changes that the speaker may not describe."],
      ["Multiple outputs", "Share a readable report or pass structured JSON into another workflow."]
    ],
    workflow: [
      "Copy an accessible Loom share URL or use the local video file.",
      "Choose Bug, Tutorial, Demo, Meeting, UX, Privacy, or a custom prompt.",
      "VideoLens extracts the synchronized audio-and-screen timeline.",
      "Confirm cited moments and export the handoff in the format your team needs."
    ],
    deliverables: ["Concise async-video summary", "Timestamped statements and screen evidence", "Mode-specific decisions, steps, issues, or claims", "Concrete tasks for the receiving team"],
    limitation: "The recording must be accessible to the resolver or provided as a local file. Workspace permissions, expiring links, authentication, and platform changes can prevent direct retrieval.",
    faqs: [
      ["Can VideoLens analyze a private Loom?", "If direct retrieval cannot access the recording, use a permitted local download or an authenticated browser workflow where appropriate. VideoLens cannot bypass access controls."],
      ["Which mode should I use for a Loom bug report?", "Use Bug mode and include the expected behavior in your prompt. For design or usability feedback, UX mode is usually a better fit."],
      ["Does the analysis replace watching the original?", "It accelerates review and points to important moments. For consequential decisions, use the timestamp citations to verify the source recording."]
    ],
    related: ["screen-recording-analyzer", "meeting-video-analyzer", "ai-video-analyzer"]
  },
  {
    slug: "meeting-video-analyzer",
    title: "AI Meeting Video Analyzer for Decisions and Actions | VideoLens",
    description: "Analyze meeting recordings for decisions, objections, commitments, and follow-up actions with timestamp citations and exportable structured reports.",
    eyebrow: "Evidence-grounded meeting review",
    h1: "Turn a meeting recording into decisions and accountable actions.",
    lead: "VideoLens reviews meeting video and audio for decisions, objections, commitments, and follow-ups, then anchors the report to the timestamps where those moments occurred.",
    summary: [
      "Meeting summaries are most useful when a teammate can verify what was decided and why. VideoLens combines the transcript with visible presentation context and produces evidence-linked findings instead of a memory-based recap.",
      "Use Meeting mode for a structured review, or ask a narrower question about a customer objection, pricing discussion, unresolved decision, or owner commitment."
    ],
    benefits: [
      ["Decision record", "Separates decisions, open questions, objections, and commitments instead of flattening the meeting into a generic summary."],
      ["Timestamp accountability", "Citations let owners verify the precise discussion behind an action item."],
      ["Visual meeting context", "Sampled frames can capture slides, shared screens, and other visible context that a transcript omits."]
    ],
    workflow: [
      "Provide the permitted meeting recording as a local file or accessible URL.",
      "Choose Meeting mode and state the decisions or themes you care about.",
      "VideoLens merges transcription, sampled visual context, and visible text into the timeline.",
      "Confirm owners and decisions, ask follow-ups, and export the final record."
    ],
    deliverables: ["Meeting summary and key themes", "Decisions, objections, and unresolved questions", "Commitments and follow-up actions", "Timestamp evidence for important claims"],
    limitation: "Speaker attribution depends on available diarization and recording quality and may be imperfect. Confirm names, owners, dates, and consequential commitments before distributing the report.",
    faqs: [
      ["Can VideoLens identify different speakers?", "It can use diarized transcription when available, but speaker attribution quality depends on the audio and transcription output. Human verification is recommended."],
      ["Can I ask about one topic instead of summarizing the whole meeting?", "Yes. Use a focused prompt, such as asking for every pricing objection or the evidence behind a specific decision."],
      ["Are meeting recordings stored by VideoLens?", "The open-source workflow runs locally. The hosted app uses ephemeral session processing and your OpenAI key; VideoLens does not build a retained meeting dataset."]
    ],
    related: ["loom-video-analyzer", "ai-video-analyzer", "video-privacy-analyzer"]
  },
  {
    slug: "video-privacy-analyzer",
    title: "AI Video Privacy Analyzer for Visible Sensitive Data | VideoLens",
    description: "Review video and screen recordings for visible credentials, personal data, internal URLs, account details, and other potential privacy exposures with timestamped evidence.",
    eyebrow: "Pre-publication privacy review",
    h1: "Find sensitive information before a video is shared.",
    lead: "VideoLens Privacy mode reviews sampled frames, on-screen text, and transcript content for potential credentials, personal information, internal URLs, account details, and other material that may require redaction.",
    summary: [
      "Screen recordings and demos can accidentally expose secrets in terminals, browser tabs, notifications, account menus, customer records, or spoken discussion. Manual review is necessary, but long recordings make brief exposures easy to miss.",
      "VideoLens produces a prioritized list of possible exposures with timestamp evidence and suggested redaction actions, giving the reviewer a faster checklist before publication or wider distribution."
    ],
    benefits: [
      ["Visible secret review", "Flags potential API keys, tokens, credentials, internal hostnames, and account identifiers seen in sampled frames."],
      ["PII and business context", "Surfaces names, emails, addresses, customer data, private conversations, and other possible disclosure risks."],
      ["Redaction checklist", "Turns each validated finding into a timestamped edit or review task."]
    ],
    workflow: [
      "Provide the video locally or through a permitted accessible source.",
      "Choose Privacy mode and specify the audience or disclosure standard you care about.",
      "VideoLens scans the transcript, frame descriptions, and OCR timeline for potential exposures.",
      "A human reviewer validates each cited moment and performs the necessary redaction or edit."
    ],
    deliverables: ["Potential sensitive-data findings", "Timestamp and evidence for each item", "Severity and exposure context", "Prioritized redaction and verification tasks"],
    limitation: "This is a sampled, AI-assisted review—not a guarantee that every exposure will be detected and not a replacement for legal, compliance, or professional security review. Increase frame sampling for high-risk material and always perform final human review.",
    faqs: [
      ["Can VideoLens guarantee a video contains no sensitive data?", "No. Sampling and model interpretation can miss brief or unclear exposures. Privacy mode is an additional review layer, not a certification or substitute for human inspection."],
      ["Does Privacy mode upload the video to VideoLens servers?", "The local and extension workflows do not use VideoLens-operated video storage. Model-processing calls use your OpenAI API key. The hosted app uses ephemeral session processing."],
      ["What kinds of information can it flag?", "Potential examples include credentials, tokens, internal URLs, emails, names, customer records, account identifiers, private messages, and sensitive spoken content visible to the analysis pipeline."]
    ],
    related: ["session-replay-analyzer", "screen-recording-analyzer", "ai-video-analyzer"]
  }
];
