from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path

import pandas as pd
import streamlit as st

from videolens.config import Config, Defaults, Models
from videolens.pipeline import ExtractionResult, run_extraction
from videolens.types import AnalysisMode


st.set_page_config(
    page_title="VideoLens",
    page_icon=":clapper:",
    layout="wide",
)


def main() -> None:
    st.title("VideoLens")
    st.caption("Universal video intelligence — prompt-directed analysis of any video.")

    with st.sidebar:
        st.subheader("Configuration")
        env_key = os.environ.get("OPENAI_API_KEY", "")
        api_key = st.text_input(
            "OpenAI API key",
            value=env_key,
            type="password",
            help="Stored only in this browser session. Sourced from OPENAI_API_KEY env var if set.",
        )

        mode = st.selectbox(
            "Analysis mode",
            options=[m.value for m in AnalysisMode],
            index=0,
            help="general = broad review; bug = repro steps; meeting = decisions + actions.",
        )

        max_frames = st.slider(
            "Max frames",
            min_value=3,
            max_value=80,
            value=20,
            step=1,
            help="Hard cap on frames sent to the vision model. Higher = better coverage, more cost.",
        )

        frame_interval = st.slider(
            "Frame interval (s)",
            min_value=1.0,
            max_value=30.0,
            value=5.0,
            step=0.5,
            help="Seconds between sampled frames. Adaptive: actual interval grows if needed to respect max frames.",
        )

        force = st.checkbox("Force reprocess (bypass cache)", value=False)

        st.divider()
        st.caption(
            "Cost guide (rough): ~$0.001/min for transcription + ~$0.002–0.01 per frame for description. "
            "A 5-min video with 20 frames is typically under $0.20."
        )

    source_tab, url_tab = st.tabs(["Upload file", "Paste URL"])

    with source_tab:
        uploaded = st.file_uploader(
            "Drop a video file",
            type=["mp4", "mov", "webm", "mkv", "m4v"],
            accept_multiple_files=False,
        )

    with url_tab:
        url = st.text_input(
            "Video URL",
            placeholder="https://www.youtube.com/watch?v=... or direct .mp4 URL",
        )

    prompt = st.text_area(
        "What do you want to know about this video?",
        value="Review this video and tell me what is happening, what's notable, and any concerns.",
        height=100,
    )

    run = st.button("Analyze", type="primary", use_container_width=True)

    if run:
        if not api_key:
            st.error("Set an OpenAI API key in the sidebar.")
            return

        source_path: str | None = None
        temp_holder: tempfile.TemporaryDirectory | None = None

        if uploaded is not None:
            temp_holder = tempfile.TemporaryDirectory(prefix="videolens_upload_")
            local = Path(temp_holder.name) / uploaded.name
            local.write_bytes(uploaded.getbuffer())
            source_path = str(local)
            st.info(f"Using uploaded file: {uploaded.name} ({uploaded.size / 1024 / 1024:.1f} MB)")
        elif url.strip():
            source_path = url.strip()
            st.info(f"Using URL: {source_path}")
        else:
            st.error("Upload a file or paste a URL.")
            return

        config = Config(
            models=Models(),
            defaults=Defaults(),
            cache_root=Path.cwd() / ".videolens" / "cache",
            openai_api_key=api_key,
        )

        status = st.status("Running extraction pipeline…", expanded=True)
        captured: list[str] = []

        class StatusConsole:
            def print(self, *args, **kwargs):
                msg = " ".join(str(a) for a in args)
                cleaned = _strip_rich_tags(msg)
                captured.append(cleaned)
                status.write(cleaned)

            def print_exception(self):
                import traceback
                tb = traceback.format_exc()
                captured.append(tb)
                status.code(tb)

        try:
            result = run_extraction(
                source_path,
                mode=AnalysisMode(mode),
                config=config,
                frame_interval=float(frame_interval),
                max_frames=int(max_frames),
                force=force,
                console=StatusConsole(),  # type: ignore[arg-type]
                prompt=prompt,
                output_dir=None,
            )
            status.update(label="Extraction complete", state="complete", expanded=False)
        except Exception as exc:
            status.update(label=f"Failed: {exc}", state="error")
            st.error(f"Pipeline failed: {exc}")
            with st.expander("Trace"):
                st.code("\n".join(captured))
            return
        finally:
            if temp_holder is not None:
                temp_holder.cleanup()

        render_results(result)


def render_results(result: ExtractionResult) -> None:
    md = result.metadata
    cols = st.columns(4)
    cols[0].metric("Duration", f"{md.duration_seconds:.1f}s" if md.duration_seconds else "?")
    cols[1].metric("Resolution", f"{md.width}×{md.height}" if md.width else "?")
    cols[2].metric("Frames analyzed", len(result.frame_summaries))
    cols[3].metric("Timeline segments", len(result.timeline.segments))

    if result.resolved.limitations:
        st.warning("Limitations:\n" + "\n".join(f"- {l}" for l in result.resolved.limitations))

    tab_report, tab_timeline, tab_frames, tab_transcript, tab_raw = st.tabs(
        ["Report", "Timeline", "Frames", "Transcript", "Cache files"]
    )

    with tab_report:
        render_report_tab(result)

    with tab_timeline:
        if not result.timeline.segments:
            st.info("No timeline segments — extraction returned no frames or transcript.")
        else:
            df = pd.DataFrame(
                [
                    {
                        "start": f"{s.start:.1f}s",
                        "end": f"{s.end:.1f}s",
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

    with tab_frames:
        if not result.frame_summaries:
            st.info("No frames described.")
        else:
            for i in range(0, len(result.frame_summaries), 3):
                cols = st.columns(3)
                for j, summary in enumerate(result.frame_summaries[i:i + 3]):
                    with cols[j]:
                        frame = result.frames[i + j] if i + j < len(result.frames) else None
                        if frame and frame.path.exists():
                            st.image(str(frame.path), use_container_width=True)
                        st.caption(f"**t={summary.timestamp:.1f}s** · {summary.confidence}")
                        st.write(summary.visual_summary or "_(no description)_")
                        if summary.detected_context:
                            st.caption("tags: " + ", ".join(summary.detected_context))
                        if summary.extracted_text:
                            with st.expander("OCR"):
                                st.write("\n".join(f"- {t}" for t in summary.extracted_text))

    with tab_transcript:
        if result.transcript is None or not result.transcript.segments:
            st.info("No transcript (no audio, or transcription failed).")
        else:
            st.caption(f"Language: {result.transcript.language or 'unknown'}")
            df = pd.DataFrame(
                [
                    {
                        "start": f"{s.start:.2f}s",
                        "end": f"{s.end:.2f}s",
                        "speaker": s.speaker or "",
                        "text": s.text,
                    }
                    for s in result.transcript.segments
                ]
            )
            st.dataframe(df, use_container_width=True, hide_index=True)

    with tab_raw:
        st.caption(f"Cache directory: `{result.cache.dir}`")
        for f in sorted(result.cache.dir.glob("*.json")):
            with st.expander(f.name):
                st.code(f.read_text(), language="json")


def render_report_tab(result: ExtractionResult) -> None:
    analysis = result.analysis
    if analysis is None:
        st.info("No analysis produced — provide a prompt and re-run.")
        return

    st.markdown(f"### Executive Summary  \n*Overall confidence: **{analysis.confidence}***")
    st.write(analysis.summary or "_(no summary)_")

    st.divider()

    cols = st.columns(2)
    with cols[0]:
        st.subheader("Findings")
        if not analysis.findings:
            st.caption("_(none)_")
        for i, f in enumerate(analysis.findings, 1):
            with st.expander(f"{i}. {f.finding}  ·  {f.confidence}", expanded=(i <= 2)):
                if f.evidence:
                    for e in f.evidence:
                        st.markdown(f"- `{_fmt_ts(e.timestamp)}` — {e.detail}")
                else:
                    st.caption("_(no evidence cited)_")

    with cols[1]:
        st.subheader("Recommendations")
        if not analysis.recommendations:
            st.caption("_(none)_")
        for r in analysis.recommendations:
            st.markdown(f"- **{r.recommendation}**  \n  _{r.rationale or ''}_  \n  Conf: {r.confidence}")

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
        col1, col2 = st.columns(2)
        col1.download_button(
            "Download report.md",
            data=result.report_markdown,
            file_name="report.md",
            mime="text/markdown",
        )
        col2.download_button(
            "Download analysis.json",
            data=analysis.model_dump_json(indent=2),
            file_name="analysis.json",
            mime="application/json",
        )


def _fmt_ts(seconds: float) -> str:
    s = max(0.0, float(seconds))
    minutes = int(s // 60)
    secs = s - minutes * 60
    return f"{minutes:02d}:{secs:05.2f}"


def _strip_rich_tags(s: str) -> str:
    import re
    return re.sub(r"\[/?[a-zA-Z0-9 _#]+\]", "", s)


if __name__ == "__main__":
    main()
