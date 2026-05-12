from __future__ import annotations

import subprocess
import sys
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
    port: int = typer.Option(8501, "--port", help="Port to run the web UI on."),
    open_browser: bool = typer.Option(True, "--open/--no-open", help="Auto-open browser."),
) -> None:
    """Launch the local web UI (Streamlit)."""
    app_path = Path(__file__).parent / "web" / "app.py"
    cmd = [
        sys.executable, "-m", "streamlit", "run", str(app_path),
        "--server.port", str(port),
        "--server.headless", "true" if not open_browser else "false",
        "--browser.gatherUsageStats", "false",
    ]
    console.print(f"[bold]Launching VideoLens UI:[/bold] http://localhost:{port}")
    subprocess.run(cmd, check=False)


@app.command()
def analyze(
    source: str = typer.Argument(..., help="Local file path, direct URL, or YouTube URL."),
    prompt: str = typer.Option(..., "--prompt", "-p", help="What you want to know about the video."),
    mode: AnalysisMode = typer.Option(AnalysisMode.GENERAL, "--mode", "-m", help="Analysis mode."),
    output_dir: Path | None = typer.Option(None, "--output-dir", "-o", help="Where to write report.md / analysis.json."),
    frame_interval: float = typer.Option(5.0, "--frame-interval", help="Seconds between sampled frames."),
    max_frames: int = typer.Option(40, "--max-frames", help="Hard cap on frames sent to the vision model (cost control)."),
    force: bool = typer.Option(False, "--force", help="Bypass cache and reprocess."),
    json_only: bool = typer.Option(False, "--json", help="Emit JSON only (skip markdown)."),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose logging."),
) -> None:
    """Analyze a video source against a prompt."""
    config = Config.load()

    if config.openai_api_key is None:
        console.print("[red]OPENAI_API_KEY is not set in the environment.[/red]")
        raise typer.Exit(code=1)

    try:
        result = run_extraction(
            source,
            mode=mode,
            config=config,
            frame_interval=frame_interval,
            max_frames=max_frames,
            force=force,
            console=console,
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
    table.add_row("Cache", str(result.cache.dir))
    console.print(table)

    console.print(
        f"\n[yellow]Phase 2 — extraction + timeline complete. Synthesis + reports come in Phase 3.[/yellow]"
    )
    console.print(f"Prompt (queued): {prompt!r}")
    console.print(f"Output dir (queued): {output_dir or '(not set)'}")
    console.print(f"JSON only (queued): {json_only}")


if __name__ == "__main__":
    app()
