from __future__ import annotations

import hashlib
import json as _json
from dataclasses import dataclass
from pathlib import Path

from openai import OpenAI
from rich.console import Console

from videolens.analysis import analyze_timeline
from videolens.cache import Cache, compute_cache_key
from videolens.config import Config
from videolens.outputs import render_markdown, write_json, write_markdown
from videolens.processors.build_timeline import build_timeline
from videolens.processors.describe_frames import describe_frames
from videolens.processors.download import fetch_to_local
from videolens.processors.extract_audio import chunk_audio, extract_audio
from videolens.processors.extract_frames import extract_frames
from videolens.processors.extract_metadata import probe_metadata
from videolens.processors.transcribe_audio import transcribe
from videolens.resolvers import resolve_source
from videolens.types import (
    AccessLevel,
    Analysis,
    AnalysisMode,
    Frame,
    FrameSummary,
    Metadata,
    ResolvedSource,
    Timeline,
    Transcript,
)


@dataclass
class ExtractionResult:
    resolved: ResolvedSource
    video_path: Path
    metadata: Metadata
    transcript: Transcript | None
    frames: list[Frame]
    frame_summaries: list[FrameSummary]
    timeline: Timeline
    cache: Cache
    analysis: Analysis | None = None
    report_markdown: str | None = None


def run_extraction(
    source: str,
    *,
    mode: AnalysisMode,
    config: Config,
    frame_interval: float = 5.0,
    max_frames: int = 40,
    force: bool = False,
    console: Console | None = None,
    prompt: str | None = None,
    output_dir: Path | None = None,
) -> ExtractionResult:
    console = console or Console()

    console.print(f"[bold]Resolving:[/bold] {source}")
    resolved = resolve_source(source)
    platform_label = resolved.platform or resolved.source_type.value
    console.print(
        f"  platform={platform_label} type={resolved.source_type.value} "
        f"access={resolved.access_level.value}"
    )
    for lim in resolved.limitations:
        console.print(f"  [yellow]limitation:[/yellow] {lim}")

    if resolved.access_level == AccessLevel.BLOCKED:
        # Pipeline can't proceed — surface the resolver's limitation as the error
        # message rather than failing later with a generic downloader error.
        why = "; ".join(resolved.limitations) or f"Source ({platform_label}) is not supported."
        raise RuntimeError(why)

    cache_key = compute_cache_key(
        resolved.source_url,
        {"frame_interval": frame_interval, "max_frames": max_frames, "mode": mode.value},
    )
    cache = Cache(config.cache_root, cache_key)
    console.print(f"[dim]cache: {cache.dir}[/dim]")
    cache.write_json("source.json", resolved)

    client = OpenAI(api_key=config.openai_api_key)

    video_path = _ensure_video(resolved, cache, force, console)
    metadata = _ensure_metadata(video_path, cache, force, console)
    frames = _ensure_frames(
        video_path, cache, force, metadata.duration_seconds, frame_interval, max_frames, console
    )

    transcript: Transcript | None = None
    if metadata.has_audio:
        transcript = _ensure_transcript(
            video_path, cache, force, mode, config, client, metadata.duration_seconds, console
        )
    else:
        console.print("[yellow]no audio track — skipping transcription[/yellow]")

    frame_summaries = _ensure_frame_summaries(frames, cache, force, client, config, console)
    timeline = _ensure_timeline(
        frame_summaries, transcript, metadata.duration_seconds, cache, force, console
    )

    analysis: Analysis | None = None
    report_md: str | None = None
    if prompt:
        analysis = _ensure_analysis(
            timeline, resolved, mode, prompt, cache, force, client, config, console
        )
        report_md = render_markdown(analysis)
        if output_dir is not None:
            output_dir.mkdir(parents=True, exist_ok=True)
            write_markdown(analysis, output_dir / "report.md")
            write_json(analysis, output_dir / "analysis.json")
            console.print(f"[green]wrote[/green] {output_dir}/report.md + analysis.json")
        cache.path("report.md").write_text(report_md)

    return ExtractionResult(
        resolved=resolved,
        video_path=video_path,
        metadata=metadata,
        transcript=transcript,
        frames=frames,
        frame_summaries=frame_summaries,
        timeline=timeline,
        cache=cache,
        analysis=analysis,
        report_markdown=report_md,
    )


def _ensure_video(
    resolved: ResolvedSource, cache: Cache, force: bool, console: Console
) -> Path:
    marker = cache.path("video_path.txt")
    if not force and marker.exists():
        existing = Path(marker.read_text().strip())
        if existing.exists():
            console.print(f"[green]cached[/green] video: {existing}")
            return existing

    console.print("[cyan]fetching video…[/cyan]")
    download_dir = cache.path("source")
    video_path, info = fetch_to_local(resolved, download_dir)
    marker.write_text(str(video_path))
    if info:
        cache.write_json("ytdlp_info.json", _filter_info(info))
    console.print(f"  → {video_path}")
    return video_path


def _ensure_metadata(video_path: Path, cache: Cache, force: bool, console: Console) -> Metadata:
    if not force:
        cached = cache.read_model("metadata.json", Metadata)
        if cached is not None:
            console.print("[green]cached[/green] metadata")
            return cached
    console.print("[cyan]probing metadata…[/cyan]")
    md = probe_metadata(video_path)
    cache.write_json("metadata.json", md)
    return md


def _ensure_transcript(
    video_path: Path,
    cache: Cache,
    force: bool,
    mode: AnalysisMode,
    config: Config,
    client: OpenAI,
    duration_seconds: float | None,
    console: Console,
) -> Transcript:
    if not force:
        cached = cache.read_model("transcript.json", Transcript)
        if cached is not None:
            console.print("[green]cached[/green] transcript")
            return cached
    audio_path = cache.path("audio.mp3")
    if force or not audio_path.exists():
        console.print("[cyan]extracting audio…[/cyan]")
        extract_audio(video_path, audio_path)
    else:
        console.print("[green]cached[/green] audio")

    chunks_dir = cache.path("audio_chunks")
    console.print("[cyan]chunking audio (30s)…[/cyan]")
    chunks = chunk_audio(audio_path, chunks_dir, chunk_seconds=30.0, total_duration=duration_seconds)
    console.print(f"  → {len(chunks)} chunks")

    console.print(f"[cyan]transcribing ({_transcribe_model_for(mode, config)})…[/cyan]")
    t = transcribe(chunks, client, config.models, mode)
    cache.write_json("transcript.json", t)
    console.print(f"  → {len(t.segments)} segments")
    return t


def _ensure_frames(
    video_path: Path,
    cache: Cache,
    force: bool,
    duration: float | None,
    frame_interval: float,
    max_frames: int,
    console: Console,
) -> list[Frame]:
    frames_index = cache.path("frames.json")
    if not force and frames_index.exists():
        cached = cache.read_json("frames.json") or []
        frames = [Frame.model_validate(f) for f in cached]
        if all(f.path.exists() for f in frames):
            console.print(f"[green]cached[/green] frames ({len(frames)})")
            return frames
    console.print(f"[cyan]extracting frames (interval={frame_interval}s, max={max_frames})…[/cyan]")
    frames = extract_frames(
        video_path,
        cache.path("frames"),
        duration_seconds=duration,
        frame_interval=frame_interval,
        max_frames=max_frames,
    )
    cache.write_json("frames.json", [f.model_dump(mode="json") for f in frames])
    console.print(f"  → {len(frames)} frames")
    return frames


def _ensure_frame_summaries(
    frames: list[Frame],
    cache: Cache,
    force: bool,
    client: OpenAI,
    config: Config,
    console: Console,
) -> list[FrameSummary]:
    if not frames:
        return []
    if not force:
        cached = cache.read_json("frame_summaries.json")
        if cached is not None:
            console.print(f"[green]cached[/green] frame summaries ({len(cached)})")
            return [FrameSummary.model_validate(s) for s in cached]
    console.print(f"[cyan]describing {len(frames)} frames ({config.models.frame_describe})…[/cyan]")
    summaries = describe_frames(frames, client, config.models, console=console)
    cache.write_json(
        "frame_summaries.json", [s.model_dump(mode="json") for s in summaries]
    )
    return summaries


def _ensure_timeline(
    frame_summaries: list[FrameSummary],
    transcript: Transcript | None,
    duration: float | None,
    cache: Cache,
    force: bool,
    console: Console,
) -> Timeline:
    if not force:
        cached = cache.read_model("timeline.json", Timeline)
        if cached is not None:
            console.print(f"[green]cached[/green] timeline ({len(cached.segments)})")
            return cached
    console.print("[cyan]building timeline…[/cyan]")
    timeline = build_timeline(frame_summaries, transcript, duration)
    cache.write_json("timeline.json", timeline)
    console.print(f"  → {len(timeline.segments)} segments")
    return timeline


def _ensure_analysis(
    timeline: Timeline,
    source: ResolvedSource,
    mode: AnalysisMode,
    prompt: str,
    cache: Cache,
    force: bool,
    client: OpenAI,
    config: Config,
    console: Console,
) -> Analysis:
    cache_key_inputs = {"prompt": prompt, "mode": mode.value, "model": config.models.synthesize}
    prompt_hash = hashlib.sha256(
        _json.dumps(cache_key_inputs, sort_keys=True).encode()
    ).hexdigest()[:8]
    cache_name = f"analysis-{prompt_hash}.json"

    if not force:
        cached = cache.read_model(cache_name, Analysis)
        if cached is not None:
            console.print(f"[green]cached[/green] analysis (prompt hash {prompt_hash})")
            return cached

    console.print(f"[cyan]synthesizing analysis ({config.models.synthesize})…[/cyan]")
    analysis = analyze_timeline(timeline, source, mode, prompt, client, config.models)
    cache.write_json(cache_name, analysis)
    cache.write_json("analysis.json", analysis)
    console.print(
        f"  → {len(analysis.findings)} findings, {len(analysis.recommendations)} recommendations, "
        f"{len(analysis.tasks)} tasks"
    )
    return analysis


def _transcribe_model_for(mode: AnalysisMode, config: Config) -> str:
    return (
        config.models.transcribe_diarize
        if mode == AnalysisMode.MEETING
        else config.models.transcribe_default
    )


def _filter_info(info: dict) -> dict:
    keep = {
        "id", "title", "description", "uploader", "channel", "duration",
        "upload_date", "webpage_url", "extractor", "tags",
    }
    return {k: info.get(k) for k in keep if k in info}
