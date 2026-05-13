"""VideoLens MCP server.

Exposes the VideoLens pipeline as MCP tools so AI agents (Claude Code, Cursor,
Windsurf, etc.) can analyse videos as a first-class capability. The server
communicates over stdio using the official `mcp` Python SDK.

Tools exposed:
- analyze_video : run the full pipeline against a source and prompt
- ask_video     : ask a follow-up question against a previously analysed video
- get_timeline  : fetch the cached timeline for a video
- get_transcript: fetch the cached transcript for a video
- get_frames    : fetch frame summaries (visual descriptions + OCR)
- list_cached   : list videos that already have cached extraction artifacts

The server requires `OPENAI_API_KEY` in the environment and the `mcp` extra
installed: `uv sync --extra mcp`. Add it to Claude Code via `claude mcp add
videolens -- videolens-mcp` after install.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

from openai import OpenAI

from videolens import __version__
from videolens.analysis import analyze_timeline, ask_question
from videolens.cache import Cache, compute_cache_key
from videolens.config import Config
from videolens.pipeline import run_extraction
from videolens.resolvers import resolve_source
from videolens.types import (
    Analysis,
    AnalysisMode,
    FrameSummary,
    Timeline,
    Transcript,
)


def _get_config(require_api_key: bool = True) -> Config:
    """Build a Config from the environment. Bubbles up missing OPENAI_API_KEY
    as a clear error the agent can surface to the user — but read-only tools
    that just touch the cache pass require_api_key=False."""
    config = Config.load()
    if require_api_key and config.openai_api_key is None:
        raise RuntimeError(
            "OPENAI_API_KEY is not set in the environment. The MCP server runs "
            "the pipeline against OpenAI on your behalf; set it before launching."
        )
    return config


def _cache_for_source(config: Config, source: str, mode: str, frame_interval: float, max_frames: int) -> Cache | None:
    """Locate the cache directory for a source without re-running the resolver
    against the network. Returns None if the cache key doesn't exist yet."""
    try:
        resolved = resolve_source(source)
    except Exception:
        return None
    key = compute_cache_key(
        resolved.source_url,
        {"frame_interval": frame_interval, "max_frames": max_frames, "mode": mode},
    )
    cache_dir = config.cache_root / key
    if not cache_dir.exists():
        return None
    return Cache(config.cache_root, key)


# ───────────────────────── tool implementations ─────────────────────────


def tool_analyze_video(
    source: str,
    prompt: str,
    mode: str = "general",
    max_frames: int = 20,
    frame_interval: float = 5.0,
    force: bool = False,
) -> dict[str, Any]:
    config = _get_config()
    try:
        analysis_mode = AnalysisMode(mode)
    except ValueError as exc:
        valid = ", ".join(m.value for m in AnalysisMode)
        raise RuntimeError(f"Unknown mode '{mode}'. Valid modes: {valid}") from exc

    result = run_extraction(
        source,
        mode=analysis_mode,
        config=config,
        frame_interval=frame_interval,
        max_frames=max_frames,
        force=force,
        prompt=prompt,
    )

    return {
        "cache_key": result.cache.dir.name,
        "source": {
            "url": result.resolved.source_url,
            "type": result.resolved.source_type.value,
            "platform": result.resolved.platform,
            "access": result.resolved.access_level.value,
            "limitations": list(result.resolved.limitations),
        },
        "metadata": result.metadata.model_dump(mode="json"),
        "timeline_segments": len(result.timeline.segments),
        "frame_summaries": len(result.frame_summaries),
        "transcript_segments": (
            len(result.transcript.segments) if result.transcript else 0
        ),
        "analysis": result.analysis.model_dump(mode="json") if result.analysis else None,
    }


def tool_ask_video(
    source: str,
    question: str,
    mode: str = "general",
    max_frames: int = 20,
    frame_interval: float = 5.0,
) -> dict[str, Any]:
    config = _get_config()
    cache = _cache_for_source(config, source, mode, frame_interval, max_frames)
    if cache is None:
        raise RuntimeError(
            f"No cached extraction for '{source}' with mode='{mode}'. "
            f"Call analyze_video first, then ask_video against the same source/mode."
        )

    timeline = cache.read_model("timeline.json", Timeline)
    if timeline is None:
        raise RuntimeError("Cache exists but timeline.json is missing — re-run analyze_video.")

    prior = cache.read_model("analysis.json", Analysis)

    client = OpenAI(api_key=config.openai_api_key)
    answer = ask_question(question, timeline, prior, client, config.models)
    return {"question": question, "answer": answer, "cache_key": cache.dir.name}


def tool_get_timeline(
    source: str,
    mode: str = "general",
    max_frames: int = 20,
    frame_interval: float = 5.0,
) -> dict[str, Any]:
    config = _get_config(require_api_key=False)
    cache = _cache_for_source(config, source, mode, frame_interval, max_frames)
    if cache is None:
        raise RuntimeError(f"No cached extraction for '{source}' with mode='{mode}'.")
    timeline = cache.read_model("timeline.json", Timeline)
    if timeline is None:
        raise RuntimeError("Cache exists but timeline.json is missing.")
    return timeline.model_dump(mode="json")


def tool_get_transcript(
    source: str,
    mode: str = "general",
    max_frames: int = 20,
    frame_interval: float = 5.0,
) -> dict[str, Any]:
    config = _get_config(require_api_key=False)
    cache = _cache_for_source(config, source, mode, frame_interval, max_frames)
    if cache is None:
        raise RuntimeError(f"No cached extraction for '{source}' with mode='{mode}'.")
    transcript = cache.read_model("transcript.json", Transcript)
    if transcript is None:
        return {"language": None, "segments": []}
    return transcript.model_dump(mode="json")


def tool_get_frames(
    source: str,
    mode: str = "general",
    max_frames: int = 20,
    frame_interval: float = 5.0,
) -> dict[str, Any]:
    config = _get_config(require_api_key=False)
    cache = _cache_for_source(config, source, mode, frame_interval, max_frames)
    if cache is None:
        raise RuntimeError(f"No cached extraction for '{source}' with mode='{mode}'.")
    raw = cache.read_json("frame_summaries.json") or []
    summaries = [FrameSummary.model_validate(s) for s in raw]
    return {"count": len(summaries), "frames": [s.model_dump(mode="json") for s in summaries]}


def tool_list_cached() -> dict[str, Any]:
    config = _get_config(require_api_key=False)
    root = config.cache_root
    if not root.exists():
        return {"count": 0, "videos": []}
    videos: list[dict[str, Any]] = []
    for cache_dir in sorted(root.iterdir()):
        if not cache_dir.is_dir():
            continue
        source_file = cache_dir / "source.json"
        if not source_file.exists():
            continue
        try:
            source = json.loads(source_file.read_text())
        except Exception:
            continue
        videos.append({
            "cache_key": cache_dir.name,
            "source_url": source.get("source_url"),
            "platform": source.get("platform") or source.get("source_type"),
            "has_analysis": (cache_dir / "analysis.json").exists(),
        })
    return {"count": len(videos), "videos": videos}


# ───────────────────────── MCP wiring ─────────────────────────


def _build_server() -> Any:
    """Construct the MCP Server with all tools registered. Imported lazily so
    `videolens-mcp --help` and `import videolens.mcp_server` work even when the
    `mcp` extra isn't installed."""
    try:
        from mcp.server import Server  # type: ignore
        from mcp.server.stdio import stdio_server  # type: ignore
        from mcp.types import TextContent, Tool  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "MCP support requires the 'mcp' extra. Install with: "
            "uv sync --extra mcp"
        ) from exc

    server = Server("videolens", version=__version__)

    TOOLS: dict[str, dict[str, Any]] = {
        "analyze_video": {
            "description": (
                "Run the full VideoLens pipeline against a video source (local file, "
                "direct URL, YouTube, Loom, Vimeo, etc.) and return a structured "
                "Analysis. The result is cached so subsequent ask_video / "
                "get_timeline calls are cheap."
            ),
            "fn": tool_analyze_video,
            "schema": {
                "type": "object",
                "properties": {
                    "source": {"type": "string", "description": "Local file path or URL."},
                    "prompt": {"type": "string", "description": "What you want to know about the video."},
                    "mode": {
                        "type": "string",
                        "enum": [m.value for m in AnalysisMode],
                        "default": "general",
                    },
                    "max_frames": {"type": "integer", "minimum": 1, "maximum": 80, "default": 20},
                    "frame_interval": {"type": "number", "minimum": 1.0, "default": 5.0},
                    "force": {"type": "boolean", "default": False},
                },
                "required": ["source", "prompt"],
            },
        },
        "ask_video": {
            "description": (
                "Ask a follow-up question against a previously analysed video. Uses "
                "the cached timeline + prior analysis — no re-extraction. Cheap."
            ),
            "fn": tool_ask_video,
            "schema": {
                "type": "object",
                "properties": {
                    "source": {"type": "string", "description": "The same source you passed to analyze_video."},
                    "question": {"type": "string"},
                    "mode": {"type": "string", "default": "general"},
                    "max_frames": {"type": "integer", "default": 20},
                    "frame_interval": {"type": "number", "default": 5.0},
                },
                "required": ["source", "question"],
            },
        },
        "get_timeline": {
            "description": "Fetch the cached timeline for a video (segments with visual/OCR/transcript).",
            "fn": tool_get_timeline,
            "schema": {
                "type": "object",
                "properties": {
                    "source": {"type": "string"},
                    "mode": {"type": "string", "default": "general"},
                    "max_frames": {"type": "integer", "default": 20},
                    "frame_interval": {"type": "number", "default": 5.0},
                },
                "required": ["source"],
            },
        },
        "get_transcript": {
            "description": "Fetch the cached transcript for a video.",
            "fn": tool_get_transcript,
            "schema": {
                "type": "object",
                "properties": {
                    "source": {"type": "string"},
                    "mode": {"type": "string", "default": "general"},
                    "max_frames": {"type": "integer", "default": 20},
                    "frame_interval": {"type": "number", "default": 5.0},
                },
                "required": ["source"],
            },
        },
        "get_frames": {
            "description": "Fetch frame summaries (visual descriptions + OCR text per frame).",
            "fn": tool_get_frames,
            "schema": {
                "type": "object",
                "properties": {
                    "source": {"type": "string"},
                    "mode": {"type": "string", "default": "general"},
                    "max_frames": {"type": "integer", "default": 20},
                    "frame_interval": {"type": "number", "default": 5.0},
                },
                "required": ["source"],
            },
        },
        "list_cached": {
            "description": "List all videos with cached extraction artifacts on this machine.",
            "fn": tool_list_cached,
            "schema": {"type": "object", "properties": {}},
        },
    }

    @server.list_tools()
    async def list_tools() -> list[Any]:
        return [
            Tool(name=name, description=spec["description"], inputSchema=spec["schema"])
            for name, spec in TOOLS.items()
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any] | None) -> list[Any]:
        spec = TOOLS.get(name)
        if spec is None:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]
        try:
            result = spec["fn"](**(arguments or {}))
            return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]
        except Exception as exc:
            return [TextContent(type="text", text=f"Error: {exc}")]

    return server, stdio_server


async def _run() -> None:
    server, stdio_server = _build_server()
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


def main() -> None:
    """Entry point for the `videolens-mcp` console script."""
    asyncio.run(_run())


if __name__ == "__main__":
    main()
