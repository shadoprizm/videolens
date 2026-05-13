from __future__ import annotations

import os
import subprocess
import sys
from importlib.util import find_spec
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from videolens import __version__
from videolens.config import Config
from videolens.pipeline import run_extraction
from videolens.types import AnalysisMode

app = typer.Typer(
    name="videolens",
    help="Universal video intelligence — prompt-directed analysis of video sources.",
    no_args_is_help=True,
    add_completion=False,
)
console = Console()


@app.command()
def version() -> None:
    """Show version."""
    console.print(f"videolens {__version__}")


@app.command()
def ui(
    port: int | None = typer.Option(
        None,
        "--port",
        help="Port to run the web UI on. Defaults to PORT or 8501.",
    ),
    host: str = typer.Option("localhost", "--host", help="Host interface for the web UI."),
    open_browser: bool = typer.Option(True, "--open/--no-open", help="Auto-open browser."),
) -> None:
    """Launch the local web UI (Streamlit)."""
    if find_spec("streamlit") is None:
        console.print("[red]Streamlit is not installed.[/red]")
        console.print("Install the UI dependencies with: [bold]uv sync --extra ui[/bold]")
        raise typer.Exit(code=1)

    effective_port = port or int(os.environ.get("PORT", "8501"))
    app_path = Path(__file__).parent / "web" / "app.py"
    cmd = [
        sys.executable, "-m", "streamlit", "run", str(app_path),
        "--server.address", host,
        "--server.port", str(effective_port),
        "--server.headless", "true" if not open_browser else "false",
        "--browser.gatherUsageStats", "false",
    ]
    console.print(f"[bold]Launching VideoLens UI:[/bold] http://{host}:{effective_port}")
    subprocess.run(cmd, check=False)


@app.command()
def analyze(
    source: str = typer.Argument(..., help="Local file path, direct URL, or YouTube URL."),
    prompt: str = typer.Option(..., "--prompt", "-p", help="What you want to know about the video."),
    mode: AnalysisMode = typer.Option(AnalysisMode.GENERAL, "--mode", "-m", help="Analysis mode."),
    output_dir: Path | None = typer.Option(None, "--output-dir", "-o", help="Where to write report.md / analysis.json."),
    frame_interval: float = typer.Option(5.0, "--frame-interval", help="Seconds between sampled frames."),
    max_frames: int = typer.Option(40, "--max-frames", help="Hard cap on frames sent to the vision model (cost control)."),
    capture_duration: float = typer.Option(60.0, "--capture-duration", help="Seconds of browser capture for session-replay sources (PostHog, Hotjar, Clarity, etc.). Real-time."),
    force: bool = typer.Option(False, "--force", help="Bypass cache and reprocess."),
    json_only: bool = typer.Option(False, "--json", help="Emit JSON only (skip markdown)."),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose logging."),
) -> None:
    """Analyze a video source against a prompt."""
    import os
    os.environ["VIDEOLENS_CAPTURE_DURATION"] = str(capture_duration)

    config = Config.load()

    if config.openai_api_key is None:
        console.print("[red]OPENAI_API_KEY is not set in the environment.[/red]")
        raise typer.Exit(code=1)

    effective_output = output_dir or (Path.cwd() / "output" / "videolens")

    try:
        result = run_extraction(
            source,
            mode=mode,
            config=config,
            frame_interval=frame_interval,
            max_frames=max_frames,
            force=force,
            console=console,
            prompt=prompt,
            output_dir=effective_output,
        )
    except Exception as exc:
        console.print(f"[red]Pipeline failed:[/red] {exc}")
        if verbose:
            console.print_exception()
        raise typer.Exit(code=2) from exc

    table = Table(title="Extraction summary", show_header=False, box=None, padding=(0, 1))
    table.add_row("Video", str(result.video_path))
    table.add_row("Duration", f"{result.metadata.duration_seconds:.1f}s" if result.metadata.duration_seconds else "?")
    table.add_row("Resolution", f"{result.metadata.width}x{result.metadata.height}" if result.metadata.width else "?")
    table.add_row("FPS", f"{result.metadata.fps:.2f}" if result.metadata.fps else "?")
    table.add_row("Audio", "yes" if result.metadata.has_audio else "no")
    table.add_row("Transcript segments", str(len(result.transcript.segments)) if result.transcript else "—")
    table.add_row("Frames", str(len(result.frames)))
    table.add_row("Frame summaries", str(len(result.frame_summaries)))
    table.add_row("Timeline segments", str(len(result.timeline.segments)))
    if result.analysis is not None:
        table.add_row("Findings", str(len(result.analysis.findings)))
        table.add_row("Recommendations", str(len(result.analysis.recommendations)))
        table.add_row("Tasks", str(len(result.analysis.tasks)))
        table.add_row("Overall confidence", result.analysis.confidence)
    table.add_row("Cache", str(result.cache.dir))
    table.add_row("Report", str(effective_output))
    console.print(table)

    if result.analysis is not None and not json_only:
        console.print()
        console.print("[bold]Executive Summary[/bold]")
        console.print(result.analysis.summary)


if __name__ == "__main__":
    app()
