from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pandas as pd
import streamlit as st

from videolens import __version__
from videolens.config import Config, Defaults, Models
from videolens.outputs import render_pdf
from videolens.pipeline import ExtractionResult, run_extraction
from videolens.types import AnalysisMode


st.set_page_config(
    page_title="VideoLens",
    page_icon=":clapper:",
    layout="wide",
    initial_sidebar_state="expanded",
)


BRAND_COLOR = "#0891B2"


STEP_KEYS: list[tuple[str, str]] = [
    ("resolve", "Resolve"),
    ("fetch", "Fetch"),
    ("probe", "Probe"),
    ("frames", "Frames"),
    ("transcribe", "Transcribe"),
    ("describe", "Describe"),
    ("timeline", "Timeline"),
    ("analyze", "Analyze"),
]


# ───────────────────────── helpers ─────────────────────────


def _fmt_ts(seconds: float) -> str:
    s = max(0.0, float(seconds))
    minutes = int(s // 60)
    secs = s - minutes * 60
    return f"{minutes:02d}:{secs:05.2f}"


def _strip_rich_tags(s: str) -> str:
    return re.sub(r"\[/?[a-zA-Z0-9 _#]+\]", "", s)


def _sanitize_filename(s: str) -> str:
    """Strip down to filesystem-safe ASCII-ish characters, collapse whitespace, cap length."""
    s = re.sub(r"[^\w\-.\s]", "", s, flags=re.UNICODE)
    s = re.sub(r"\s+", "_", s.strip())
    s = s.strip("._-")
    return (s[:80] or "videolens_analysis")


def _output_basename(result: ExtractionResult) -> str:
    """Derive a sensible base filename from the source. Priority:
    1. yt-dlp title (best for YouTube)
    2. video_path stem (uploaded files keep their original name)
    3. generic fallback
    """
    info_path = result.cache.path("ytdlp_info.json")
    if info_path.exists():
        try:
            info = json.loads(info_path.read_text())
            title = (info.get("title") or "").strip()
            if title:
                return _sanitize_filename(title)
        except Exception:
            pass

    stem = result.video_path.stem
    if stem and stem.lower() != "video":
        return _sanitize_filename(stem)

    return "videolens_analysis"


def _save_upload(uploaded) -> Path:
    """Persist an uploaded file under .videolens/uploads/<hash>/ so it survives
    reruns and can be replayed in the video player."""
    data = bytes(uploaded.getbuffer())
    h = hashlib.sha256(data).hexdigest()[:16]
    upload_dir = Path.cwd() / ".videolens" / "uploads" / h
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / uploaded.name
    if not dest.exists():
        dest.write_bytes(data)
    return dest


def _estimate_cost(max_frames: int, assumed_minutes: float = 3.0) -> tuple[float, float]:
    """Rough estimate; returns (low, high) USD."""
    per_frame_low, per_frame_high = 0.003, 0.008
    per_min_transcribe = 0.003
    synth_low, synth_high = 0.03, 0.12

    low = min(max_frames, 5) * per_frame_low + max(0.5, assumed_minutes * 0.3) * per_min_transcribe + synth_low
    high = max_frames * per_frame_high + (assumed_minutes * 1.5) * per_min_transcribe + synth_high
    return low, high


def _step_index_from_message(msg: str) -> int | None:
    msg_low = msg.lower()
    if "resolving:" in msg_low or "type=" in msg_low:
        return 0
    if "fetching video" in msg_low or "cached video" in msg_low:
        return 1
    if "probing metadata" in msg_low or "cached metadata" in msg_low:
        return 2
    if "extracting frames" in msg_low or "cached frames" in msg_low:
        return 3
    if (
        "extracting audio" in msg_low
        or "cached audio" in msg_low
        or "chunking audio" in msg_low
        or "transcribing" in msg_low
        or "cached transcript" in msg_low
    ):
        return 4
    if "describing" in msg_low or "cached frame summaries" in msg_low or "described " in msg_low:
        return 5
    if "building timeline" in msg_low or "cached timeline" in msg_low:
        return 6
    if "synthesizing analysis" in msg_low or "cached analysis" in msg_low:
        return 7
    return None


def _render_stepper(state: list[str]) -> str:
    """state[i] in {'pending','running','complete'}. Returns HTML."""
    icons = {"pending": "○", "running": "●", "complete": "✓"}
    colors = {"pending": "#94A3B8", "running": BRAND_COLOR, "complete": "#10B981"}
    chips = []
    for i, (_, label) in enumerate(STEP_KEYS):
        s = state[i] if i < len(state) else "pending"
        chip = (
            f'<span style="display:inline-flex;align-items:center;gap:6px;'
            f'padding:6px 10px;margin:2px 4px;border-radius:14px;'
            f'background:{colors[s]}15;color:{colors[s]};'
            f'font-size:12.5px;font-weight:600;border:1px solid {colors[s]}40;">'
            f'{icons[s]} {label}</span>'
        )
        chips.append(chip)
    return '<div style="display:flex;flex-wrap:wrap;line-height:1.8">' + "".join(chips) + "</div>"


def _mode_description(mode: str) -> str:
    return {
        "general": "Broad review: what's happening, what stands out, what's worth knowing.",
        "bug": "Bug recording: repro steps, severity, ticket-ready summary.",
        "meeting": "Decisions, objections, commitments, follow-ups (diarized transcript when available).",
        "ux": "Session replay: user intent, friction points, abandoned flows, UI/copy fixes.",
        "tutorial": "How-to video: tools, commands, ordered steps, prerequisites, agent-ready checklist.",
        "product_demo": "Product demo: feature inventory, positioning, strengths/weaknesses, opportunities.",
        "content": "Content critique: hook, pacing, clarity, claims/proof, suggested edits.",
        "privacy": "Privacy review: visible secrets, credentials, PII, internal URLs — redaction plan.",
    }.get(mode, "")


# ───────────────────────── layout ─────────────────────────


def main() -> None:
    _render_header()

    with st.sidebar:
        _render_sidebar_config()

    api_key = st.session_state.get("api_key", "")
    mode = st.session_state.get("mode", "general")
    max_frames = st.session_state.get("max_frames", 20)
    frame_interval = st.session_state.get("frame_interval", 5.0)
    force = st.session_state.get("force", False)

    source_tab, url_tab = st.tabs(["**Upload file**", "**Paste URL**"])

    source_path: str | None = None
    upload_path: Path | None = None

    with source_tab:
        uploaded = st.file_uploader(
            "Drop a video file",
            type=["mp4", "mov", "webm", "mkv", "m4v"],
            accept_multiple_files=False,
            label_visibility="collapsed",
        )
        if uploaded is not None:
            upload_path = _save_upload(uploaded)
            source_path = str(upload_path)
            st.caption(
                f"`{uploaded.name}` · {uploaded.size / 1024 / 1024:.1f} MB · saved to "
                f"`{upload_path.parent.relative_to(Path.cwd())}/`"
            )

    with url_tab:
        url = st.text_input(
            "Video URL",
            placeholder="https://www.youtube.com/watch?v=... or direct .mp4 URL",
            label_visibility="collapsed",
        )
        if url.strip() and source_path is None:
            source_path = url.strip()

    if "prompt_value" not in st.session_state:
        st.session_state["prompt_value"] = (
            "Review this video and tell me what is happening, what's notable, and any concerns."
        )

    prompt = st.text_area(
        "What do you want to know about this video?",
        value=st.session_state["prompt_value"],
        height=100,
        key="prompt_input",
    )
    st.session_state["prompt_value"] = prompt

    enhance_col, _spacer = st.columns([1, 4])
    if enhance_col.button("✨ Enhance prompt", use_container_width=True, help="Rewrite your prompt to be sharper and mode-aware. Costs less than a cent."):
        if not api_key:
            st.warning("Enter your OpenAI API key in the sidebar before enhancing.")
        elif not prompt.strip():
            st.warning("Type a prompt first, then click Enhance.")
        else:
            with st.spinner("Enhancing prompt…"):
                from openai import OpenAI as _OpenAI
                from videolens.analysis import enhance_prompt as _enhance_prompt
                from videolens.analysis.enhance_prompt import EnhancePromptError as _EnhancePromptError
                try:
                    client = _OpenAI(api_key=api_key)
                    new_prompt = _enhance_prompt(
                        prompt,
                        AnalysisMode(mode),
                        client,
                        Models(),
                    )
                    st.session_state["prompt_value"] = new_prompt
                    st.rerun()
                except _EnhancePromptError as exc:
                    st.error(f"Enhance failed: {exc}")

    cost_low, cost_high = _estimate_cost(max_frames)
    run_col, cost_col = st.columns([1, 2])
    run = run_col.button("Analyze", type="primary", use_container_width=True)
    cost_col.markdown(
        f'<div style="display:flex;align-items:center;height:100%;color:#475569;font-size:13px;padding-left:8px">'
        f'Estimated: <span style="color:{BRAND_COLOR};font-weight:600;margin:0 6px">'
        f'~${cost_low:.2f}–${cost_high:.2f}</span>'
        f'<span style="color:#94A3B8">· assumes ~3-min video · scales with duration</span></div>',
        unsafe_allow_html=True,
    )

    if run:
        if not api_key:
            st.error("Enter your OpenAI API key in the sidebar.")
            return
        if source_path is None:
            st.error("Upload a file or paste a URL.")
            return

        st.session_state.pop("result", None)
        st.session_state["qa_history"] = []
        st.session_state["seek_to"] = 0
        _run_pipeline(source_path, prompt, mode, max_frames, frame_interval, force, api_key)

    if "result" in st.session_state:
        render_results(st.session_state["result"])


def _render_header() -> None:
    st.markdown(
        f"""
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:14px 0 10px 0;border-bottom:1px solid #E2E8F0;margin-bottom:18px">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;
                        background:linear-gradient(135deg,{BRAND_COLOR},#6366F1);
                        -webkit-background-clip:text;-webkit-text-fill-color:transparent">
              VideoLens
            </div>
            <span style="padding:3px 8px;background:#F1F5F9;color:#64748B;
                         border-radius:8px;font-size:11px;font-weight:600">
              v{__version__} · alpha
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:14px;color:#64748B;font-size:13px">
            <a href="https://github.com/shadoprizm/videolens" target="_blank"
               style="color:#64748B;text-decoration:none">GitHub ↗</a>
          </div>
        </div>
        <div style="color:#475569;font-size:14.5px;margin-bottom:24px">
          Prompt-directed video intelligence. Drop a video, ask a question, get a timestamped report.
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_sidebar_config() -> None:
    api_key = st.text_input(
        "OpenAI API key",
        value=st.session_state.get("api_key", ""),
        type="password",
        placeholder="sk-...",
        help="Kept only in this browser session. VideoLens does not store your key.",
    )
    st.session_state["api_key"] = api_key.strip()
    st.caption(
        "BYOK: your key is used for this session only and is never saved by VideoLens."
    )

    st.divider()

    mode = st.selectbox(
        "Analysis mode",
        options=[m.value for m in AnalysisMode],
        index=[m.value for m in AnalysisMode].index(st.session_state.get("mode", "general")),
    )
    st.session_state["mode"] = mode
    st.caption(_mode_description(mode))

    st.divider()

    st.session_state["max_frames"] = st.slider(
        "Max frames",
        min_value=3,
        max_value=80,
        value=st.session_state.get("max_frames", 20),
        step=1,
        help="Cap on frames sent to the vision model. Higher = better coverage, more cost.",
    )

    st.session_state["frame_interval"] = st.slider(
        "Frame interval (s)",
        min_value=1.0,
        max_value=30.0,
        value=st.session_state.get("frame_interval", 5.0),
        step=0.5,
        help="Seconds between sampled frames. Adaptive — grows if needed to respect max frames.",
    )

    st.session_state["force"] = st.checkbox(
        "Force reprocess (bypass cache)",
        value=st.session_state.get("force", False),
    )


# ───────────────────────── pipeline runner ─────────────────────────


def _run_pipeline(
    source_path: str,
    prompt: str,
    mode: str,
    max_frames: int,
    frame_interval: float,
    force: bool,
    api_key: str,
) -> None:
    config = Config(
        models=Models(),
        defaults=Defaults(),
        cache_root=Path.cwd() / ".videolens" / "cache",
        openai_api_key=api_key,
    )

    state: list[str] = ["pending"] * len(STEP_KEYS)
    container = st.container()
    stepper_slot = container.empty()
    log_expander = container.expander("Detailed log", expanded=False)
    captured: list[str] = []

    stepper_slot.markdown(_render_stepper(state), unsafe_allow_html=True)

    class UIConsole:
        def print(self, *args, **kwargs):
            msg = " ".join(str(a) for a in args)
            cleaned = _strip_rich_tags(msg)
            captured.append(cleaned)
            log_expander.write(cleaned)

            idx = _step_index_from_message(cleaned)
            if idx is not None:
                for i in range(idx):
                    if state[i] != "complete":
                        state[i] = "complete"
                if state[idx] != "complete":
                    state[idx] = "running"
                stepper_slot.markdown(_render_stepper(state), unsafe_allow_html=True)

        def print_exception(self):
            import traceback
            tb = traceback.format_exc()
            captured.append(tb)
            log_expander.code(tb)

    try:
        result = run_extraction(
            source_path,
            mode=AnalysisMode(mode),
            config=config,
            frame_interval=float(frame_interval),
            max_frames=int(max_frames),
            force=force,
            console=UIConsole(),  # type: ignore[arg-type]
            prompt=prompt,
            output_dir=None,
        )
    except Exception as exc:
        for i in range(len(state)):
            if state[i] == "running":
                state[i] = "pending"
        stepper_slot.markdown(_render_stepper(state), unsafe_allow_html=True)
        st.error(f"Pipeline failed: {exc}")
        with st.expander("Trace"):
            st.code("\n".join(captured))
        return

    state = ["complete"] * len(STEP_KEYS)
    stepper_slot.markdown(_render_stepper(state), unsafe_allow_html=True)
    st.session_state["result"] = result
    st.session_state["pdf_bytes"] = None
    if result.analysis is not None:
        try:
            st.session_state["pdf_bytes"] = render_pdf(result.analysis)
        except Exception as exc:
            st.session_state["pdf_error"] = str(exc)


# ───────────────────────── results ─────────────────────────


def render_results(result: ExtractionResult) -> None:
    md = result.metadata
    cols = st.columns(5)
    platform = result.resolved.platform or result.resolved.source_type.value
    cols[0].metric("Source", platform)
    cols[1].metric("Duration", f"{md.duration_seconds:.1f}s" if md.duration_seconds else "?")
    cols[2].metric("Resolution", f"{md.width}×{md.height}" if md.width else "?")
    cols[3].metric("Frames analyzed", len(result.frame_summaries))
    cols[4].metric("Timeline segments", len(result.timeline.segments))

    if result.resolved.limitations:
        st.warning(
            "Limitations:\n"
            + "\n".join(f"- {limitation}" for limitation in result.resolved.limitations)
        )

    tab_report, tab_timeline, tab_frames, tab_transcript, tab_raw = st.tabs(
        ["**Report**", "Timeline", "Frames", "Transcript", "Cache"]
    )

    with tab_report:
        render_report_tab(result)
    with tab_timeline:
        render_timeline_tab(result)
    with tab_frames:
        render_frames_tab(result)
    with tab_transcript:
        render_transcript_tab(result)
    with tab_raw:
        render_cache_tab(result)


def render_report_tab(result: ExtractionResult) -> None:
    analysis = result.analysis
    if analysis is None:
        st.info("No analysis produced — provide a prompt and re-run.")
        return

    player_col, report_col = st.columns([1, 1.3])

    with player_col:
        st.markdown("**Player**")
        video_path = result.video_path
        if video_path.exists():
            st.video(str(video_path), start_time=int(st.session_state.get("seek_to", 0)))
            if st.session_state.get("seek_to", 0) > 0:
                if st.button("⏮ Reset to start", use_container_width=True):
                    st.session_state["seek_to"] = 0
                    st.rerun()
        else:
            st.info("Video file no longer available for playback.")

    with report_col:
        conf_color = {"high": "#10B981", "medium": "#F59E0B", "low": "#EF4444"}.get(
            analysis.confidence, "#94A3B8"
        )
        st.markdown(
            f"""
            <div style="display:flex;align-items:center;justify-content:space-between;
                        padding:14px 16px;background:#F8FAFC;border-radius:10px;
                        border-left:4px solid {conf_color};margin-bottom:12px">
              <div style="font-weight:700;color:#0F172A;font-size:15px">Executive Summary</div>
              <div style="font-size:12px;color:{conf_color};font-weight:700;text-transform:uppercase">
                {analysis.confidence} confidence
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.write(analysis.summary or "_(no summary)_")

    st.divider()

    cols = st.columns([1.2, 1])
    with cols[0]:
        st.subheader("Findings")
        if not analysis.findings:
            st.caption("_(none)_")
        for i, f in enumerate(analysis.findings, 1):
            conf_color = {"high": "#10B981", "medium": "#F59E0B", "low": "#EF4444"}.get(
                f.confidence, "#94A3B8"
            )
            with st.expander(f"**{i}. {f.finding}**", expanded=(i <= 2)):
                st.markdown(
                    f'<span style="font-size:11px;color:{conf_color};font-weight:700;'
                    f'text-transform:uppercase">{f.confidence} confidence</span>',
                    unsafe_allow_html=True,
                )
                if f.evidence:
                    st.markdown("**Evidence**")
                    for j, e in enumerate(f.evidence):
                        ev_cols = st.columns([1, 5])
                        with ev_cols[0]:
                            if st.button(
                                f"⏱ {_fmt_ts(e.timestamp)}",
                                key=f"seek_{i}_{j}_{e.timestamp}",
                                use_container_width=True,
                            ):
                                st.session_state["seek_to"] = e.timestamp
                                st.rerun()
                        ev_cols[1].markdown(e.detail)
                else:
                    st.caption("_(no evidence cited)_")

    with cols[1]:
        st.subheader("Recommendations")
        if not analysis.recommendations:
            st.caption("_(none)_")
        for r in analysis.recommendations:
            st.markdown(f"**{r.recommendation}**")
            if r.rationale:
                st.caption(r.rationale)
            st.caption(f"Confidence: {r.confidence}")
            st.write("")

        st.subheader("Tasks")
        if not analysis.tasks:
            st.caption("_(none)_")
        for t in analysis.tasks:
            if t.detail:
                st.markdown(f"- **{t.title}** — {t.detail}")
            else:
                st.markdown(f"- {t.title}")

    if analysis.limitations:
        st.divider()
        st.subheader("Limitations")
        for lim in analysis.limitations:
            st.markdown(f"- {lim}")

    if result.report_markdown:
        st.divider()
        basename = _output_basename(result)
        st.caption(f"Downloads named after the source: `{basename}_*`")

        pdf_bytes = st.session_state.get("pdf_bytes")
        pdf_error = st.session_state.get("pdf_error")

        dl_cols = st.columns(3)
        if pdf_bytes:
            dl_cols[0].download_button(
                "📄 Download PDF",
                data=pdf_bytes,
                file_name=f"{basename}_report.pdf",
                mime="application/pdf",
                use_container_width=True,
            )
        else:
            dl_cols[0].button("PDF unavailable", disabled=True, use_container_width=True)
            if pdf_error:
                dl_cols[0].caption(f"PDF error: {pdf_error}")
        dl_cols[1].download_button(
            "📝 Download Markdown",
            data=result.report_markdown,
            file_name=f"{basename}_report.md",
            mime="text/markdown",
            use_container_width=True,
        )
        dl_cols[2].download_button(
            "🗂 Download JSON",
            data=analysis.model_dump_json(indent=2),
            file_name=f"{basename}_analysis.json",
            mime="application/json",
            use_container_width=True,
        )

    _render_qa_section(result)


def _render_qa_section(result: ExtractionResult) -> None:
    """Q&A loop: ask follow-up questions against the cached timeline + prior
    analysis. Each Q&A is one cheap synthesis call; the heavy extraction never
    re-runs."""
    st.divider()
    st.subheader("💬 Ask a follow-up question")
    st.caption(
        "Costs a few cents per question. The video isn't re-processed — only the "
        "synthesis call runs again."
    )

    qa_history: list[dict[str, str]] = st.session_state.setdefault("qa_history", [])

    for entry in qa_history:
        with st.chat_message("user"):
            st.markdown(entry["question"])
        with st.chat_message("assistant"):
            st.markdown(entry["answer"])

    if "qa_input" not in st.session_state:
        st.session_state["qa_input"] = ""

    new_question = st.text_input(
        "Your question",
        value=st.session_state["qa_input"],
        key="qa_input_widget",
        placeholder="e.g. What specifically went wrong at the 1:20 mark?",
        label_visibility="collapsed",
    )

    api_key = st.session_state.get("api_key", "")

    if st.button("Ask", type="secondary"):
        if not api_key:
            st.warning("Enter your OpenAI API key in the sidebar before asking.")
        elif not new_question.strip():
            st.warning("Type a question first.")
        else:
            with st.spinner("Thinking…"):
                from openai import OpenAI as _OpenAI
                from videolens.analysis import ask_question as _ask_question
                from videolens.analysis.ask_question import (
                    AskQuestionError as _AskQuestionError,
                )

                try:
                    client = _OpenAI(api_key=api_key)
                    answer = _ask_question(
                        new_question,
                        result.timeline,
                        result.analysis,
                        client,
                        Models(),
                    )
                    qa_history.append({"question": new_question, "answer": answer})
                    st.session_state["qa_history"] = qa_history
                    st.session_state["qa_input"] = ""
                    st.rerun()
                except _AskQuestionError as exc:
                    st.error(f"Q&A failed: {exc}")

    if qa_history:
        if st.button("Clear conversation", type="secondary"):
            st.session_state["qa_history"] = []
            st.rerun()


def render_timeline_tab(result: ExtractionResult) -> None:
    if not result.timeline.segments:
        st.info("No timeline segments — extraction returned no frames or transcript.")
        return
    df = pd.DataFrame(
        [
            {
                "start": _fmt_ts(s.start),
                "end": _fmt_ts(s.end),
                "scene": s.scene_type or "",
                "visual": s.visual_summary or "",
                "ocr": ", ".join(s.ocr) if s.ocr else "",
                "transcript": s.transcript or "",
                "conf": s.confidence,
            }
            for s in result.timeline.segments
        ]
    )
    st.dataframe(df, use_container_width=True, hide_index=True)


def render_frames_tab(result: ExtractionResult) -> None:
    if not result.frame_summaries:
        st.info("No frames described.")
        return
    for i in range(0, len(result.frame_summaries), 3):
        cols = st.columns(3)
        for j, summary in enumerate(result.frame_summaries[i:i + 3]):
            with cols[j]:
                frame = result.frames[i + j] if i + j < len(result.frames) else None
                if frame and frame.path.exists():
                    st.image(str(frame.path), use_container_width=True)
                st.caption(f"**t={_fmt_ts(summary.timestamp)}** · {summary.confidence}")
                st.write(summary.visual_summary or "_(no description)_")
                if summary.detected_context:
                    st.caption("tags: " + ", ".join(summary.detected_context))
                if summary.extracted_text:
                    with st.expander("OCR"):
                        st.write("\n".join(f"- {t}" for t in summary.extracted_text))


def render_transcript_tab(result: ExtractionResult) -> None:
    if result.transcript is None or not result.transcript.segments:
        st.info("No transcript (no audio, or transcription failed).")
        return
    st.caption(f"Language: {result.transcript.language or 'unknown'}")
    df = pd.DataFrame(
        [
            {
                "start": _fmt_ts(s.start),
                "end": _fmt_ts(s.end),
                "speaker": s.speaker or "",
                "text": s.text,
            }
            for s in result.transcript.segments
        ]
    )
    st.dataframe(df, use_container_width=True, hide_index=True)


def render_cache_tab(result: ExtractionResult) -> None:
    st.caption(f"Cache directory: `{result.cache.dir}`")
    for f in sorted(result.cache.dir.glob("*.json")):
        with st.expander(f.name):
            st.code(f.read_text(), language="json")


if __name__ == "__main__":
    main()
