from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request

REPO_URL = "https://github.com/shadoprizm/videolens.git"
RUNTIME_REF = "d742a586a4abdc5457f971e0b0e1b916247c916d"
SPEND_ACTIONS = {"analyze"}
VALID_MODES = {
    "general",
    "bug",
    "meeting",
    "ux",
    "tutorial",
    "product_demo",
    "content",
    "privacy",
    "production_recipe",
}


def _json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))


def _openclaw_data_root() -> Path:
    explicit = os.environ.get("VIDEOLENS_SKILL_STATE_DIR", "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()

    try:
        from occ.config import settings  # type: ignore

        return Path(settings.paths.data).expanduser().resolve()
    except (ImportError, AttributeError):
        state_dir = Path(os.environ.get("OPENCLAW_STATE_DIR", "~/.openclaw")).expanduser()
        return (state_dir / "data").resolve()


def _state_root() -> Path:
    return _openclaw_data_root() / "videolens-video-intelligence"


def _repo_dir() -> Path:
    return _state_root() / "videolens"


def _runs_dir() -> Path:
    return _state_root() / "runs"


def _gateway_port() -> int:
    try:
        from occ.config import settings  # type: ignore

        return int(settings.server.port)
    except (ImportError, AttributeError, TypeError, ValueError):
        return int(os.environ.get("OPENCLAW_GATEWAY_PORT", "18789"))


def _task_api_url(context: dict[str, Any]) -> str:
    task_id = context.get("task_id")
    if not task_id:
        raise ValueError("task_id is required when pre_instructions are not supplied")
    gateway_url = str(
        context.get("gateway_url") or f"http://127.0.0.1:{_gateway_port()}"
    ).rstrip("/")
    return f"{gateway_url}/api/tasks/{task_id}"


def _fetch_task_payload(context: dict[str, Any]) -> dict[str, Any]:
    if context.get("pre_instructions") is not None:
        return {"pre_instructions": context.get("pre_instructions")}
    with request.urlopen(_task_api_url(context), timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def _extract_structured_block(text: str) -> str:
    raw = (text or "").strip()
    if not raw:
        return ""
    if raw.startswith("```"):
        lines = raw.splitlines()
        if len(lines) >= 3 and lines[-1].strip() == "```":
            return "\n".join(lines[1:-1]).strip()
    return raw


def _parse_task_spec(pre_instructions: str) -> dict[str, Any]:
    payload = _extract_structured_block(pre_instructions)
    if not payload:
        return {"action": "preflight"}
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as json_error:
        try:
            import yaml  # type: ignore
        except ImportError as exc:
            raise ValueError("Use a JSON object for VideoLens task instructions") from exc
        try:
            data = yaml.safe_load(payload)
        except Exception as exc:
            raise ValueError("VideoLens task instructions must be valid JSON or YAML") from exc
        if data is None:
            raise ValueError("VideoLens task instructions cannot be empty") from json_error
    if not isinstance(data, dict):
        raise ValueError("VideoLens task instructions must be a JSON/YAML object")
    if not data.get("action"):
        data["action"] = "preflight"
    return data


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int, name: str) -> int:
    try:
        parsed = int(default if value is None else value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if not minimum <= parsed <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return parsed


def _bounded_float(
    value: Any, *, default: float, minimum: float, maximum: float, name: str
) -> float:
    try:
        parsed = float(default if value is None else value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a number") from exc
    if not minimum <= parsed <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return parsed


def _run_command(
    command: list[str],
    *,
    env: dict[str, str] | None = None,
    cwd: Path | None = None,
    timeout: int = 300,
) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            command,
            cwd=str(cwd) if cwd else None,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {
            "command": command,
            "cwd": str(cwd) if cwd else None,
            "returncode": None,
            "stdout": "",
            "stderr": str(exc),
            "success": False,
        }
    return {
        "command": command,
        "cwd": str(cwd) if cwd else None,
        "returncode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
        "success": completed.returncode == 0,
    }


def _git_value(repo_dir: Path, *args: str) -> str | None:
    result = _run_command(["git", "-C", str(repo_dir), *args], timeout=30)
    return result["stdout"].strip() if result["success"] else None


def _repo_is_clean(repo_dir: Path) -> bool:
    status = _git_value(repo_dir, "status", "--porcelain")
    return status == ""


def _ensure_repo(spec: dict[str, Any]) -> dict[str, Any]:
    state_dir = _state_root()
    repo_dir = _repo_dir()
    state_dir.mkdir(parents=True, exist_ok=True)
    timeout = _bounded_int(
        spec.get("bootstrap_timeout_seconds"),
        default=900,
        minimum=60,
        maximum=3600,
        name="bootstrap_timeout_seconds",
    )
    steps: list[dict[str, Any]] = []

    if not repo_dir.exists():
        clone = _run_command(
            ["git", "clone", "--filter=blob:none", REPO_URL, str(repo_dir)],
            cwd=state_dir,
            timeout=timeout,
        )
        steps.append(clone)
        if not clone["success"]:
            return {"success": False, "steps": steps, "runtime_ref": RUNTIME_REF}
    elif not (repo_dir / ".git").exists():
        return {
            "success": False,
            "steps": steps,
            "runtime_ref": RUNTIME_REF,
            "error": f"Runtime path exists but is not a git repository: {repo_dir}",
        }

    origin = _git_value(repo_dir, "remote", "get-url", "origin")
    if origin not in {REPO_URL, "git@github.com:shadoprizm/videolens.git"}:
        return {
            "success": False,
            "steps": steps,
            "runtime_ref": RUNTIME_REF,
            "error": f"Unexpected VideoLens runtime origin: {origin or 'missing'}",
        }

    current_ref = _git_value(repo_dir, "rev-parse", "HEAD")
    if current_ref == RUNTIME_REF:
        return {
            "success": True,
            "steps": steps,
            "runtime_ref": RUNTIME_REF,
            "stdout": "Pinned VideoLens runtime is ready.",
        }

    if current_ref and not _repo_is_clean(repo_dir):
        return {
            "success": False,
            "steps": steps,
            "runtime_ref": RUNTIME_REF,
            "error": (
                "The managed VideoLens runtime has local changes. Preserve or remove those changes "
                "before the skill switches to its tested revision."
            ),
        }

    fetch = _run_command(
        ["git", "-C", str(repo_dir), "fetch", "--depth", "1", "origin", RUNTIME_REF],
        timeout=timeout,
    )
    steps.append(fetch)
    if not fetch["success"]:
        return {"success": False, "steps": steps, "runtime_ref": RUNTIME_REF}

    checkout = _run_command(
        ["git", "-C", str(repo_dir), "checkout", "--detach", RUNTIME_REF],
        timeout=timeout,
    )
    steps.append(checkout)
    return {
        "success": checkout["success"],
        "steps": steps,
        "runtime_ref": RUNTIME_REF,
        "stdout": checkout["stdout"],
        "stderr": checkout["stderr"],
    }


def _uv_command() -> str | None:
    return shutil.which("uv")


def _venv_python(repo_dir: Path) -> Path:
    if os.name == "nt":
        return repo_dir / ".venv" / "Scripts" / "python.exe"
    return repo_dir / ".venv" / "bin" / "python"


def _ensure_runtime(spec: dict[str, Any]) -> dict[str, Any]:
    repo_dir = _repo_dir()
    timeout = _bounded_int(
        spec.get("bootstrap_timeout_seconds"),
        default=900,
        minimum=60,
        maximum=3600,
        name="bootstrap_timeout_seconds",
    )
    uv = _uv_command()
    if uv:
        return _run_command([uv, "sync", "--extra", "ui"], cwd=repo_dir, timeout=timeout)

    python = shutil.which("python3") or sys.executable
    venv_python = _venv_python(repo_dir)
    steps: list[dict[str, Any]] = []
    if not venv_python.exists():
        create = _run_command([python, "-m", "venv", str(repo_dir / ".venv")], timeout=timeout)
        steps.append(create)
        if not create["success"]:
            return {"success": False, "steps": steps}

    install = _run_command(
        [str(venv_python), "-m", "pip", "install", "-e", ".[ui]"],
        cwd=repo_dir,
        timeout=timeout,
    )
    steps.append(install)
    return {
        "success": install["success"],
        "steps": steps,
        "stdout": install["stdout"],
        "stderr": install["stderr"],
        "returncode": install["returncode"],
    }


def _collect_runtime_state() -> dict[str, Any]:
    repo_dir = _repo_dir()
    venv_python = _venv_python(repo_dir)
    current_ref = _git_value(repo_dir, "rev-parse", "HEAD") if repo_dir.exists() else None
    return {
        "state_dir": str(_state_root()),
        "repo_dir": str(repo_dir),
        "runs_dir": str(_runs_dir()),
        "repo_present": repo_dir.exists(),
        "pyproject_present": (repo_dir / "pyproject.toml").exists(),
        "runtime_ref": current_ref,
        "runtime_ref_expected": RUNTIME_REF,
        "runtime_ref_matches": current_ref == RUNTIME_REF,
        "uv_available": _uv_command() is not None,
        "python3_available": shutil.which("python3") is not None,
        "git_available": shutil.which("git") is not None,
        "ffmpeg_available": shutil.which("ffmpeg") is not None,
        "ffprobe_available": shutil.which("ffprobe") is not None,
        "openai_api_key_present": bool(os.environ.get("OPENAI_API_KEY", "").strip()),
        "venv_python": str(venv_python),
        "venv_present": venv_python.exists(),
    }


def _build_preflight_report(spec: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    issues: list[str] = []
    if not state["git_available"]:
        issues.append("git is missing")
    if not state["ffmpeg_available"]:
        issues.append("ffmpeg is missing")
    if not state["ffprobe_available"]:
        issues.append("ffprobe is missing")
    if not state["uv_available"] and not state["python3_available"]:
        issues.append("uv or python3 is required")
    if not state["repo_present"]:
        issues.append("VideoLens runtime is not bootstrapped")
    elif not state["runtime_ref_matches"]:
        issues.append("VideoLens runtime is not on the skill's tested revision")
    if state["repo_present"] and not state["pyproject_present"]:
        issues.append("VideoLens pyproject.toml is missing")
    if state["repo_present"] and not state["venv_present"]:
        issues.append("VideoLens Python environment is not bootstrapped")
    if not state["openai_api_key_present"]:
        issues.append("OPENAI_API_KEY is missing for local analysis")

    next_steps: list[str] = []
    if not state["repo_present"] or not state["runtime_ref_matches"] or not state["venv_present"]:
        next_steps.append("Run the bootstrap action")
    if not state["openai_api_key_present"]:
        next_steps.append("Configure OPENAI_API_KEY before local analysis")
    if not next_steps:
        next_steps.append("VideoLens is ready for a credit-spending analyze action")

    return {
        "success": not issues,
        "summary": "VideoLens preflight passed" if not issues else f"VideoLens preflight found {len(issues)} issue(s)",
        "action": "preflight",
        "issues": issues,
        "next_steps": next_steps,
        "state": state,
        "requested_spec": spec,
    }


def _require_fields(spec: dict[str, Any], *names: str) -> None:
    missing = [name for name in names if not str(spec.get(name) or "").strip()]
    if missing:
        raise ValueError(f"Missing required field(s) for action '{spec.get('action')}': {', '.join(missing)}")


def _new_run_dir(spec: dict[str, Any]) -> Path:
    requested = str(spec.get("run_id") or "").strip()
    if requested:
        slug = re.sub(r"[^A-Za-z0-9._-]+", "-", requested).strip("-.")[:80]
        if not slug:
            raise ValueError("run_id must contain at least one letter or number")
    else:
        slug = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    return (_runs_dir() / slug).resolve()


def _videolens_executable(repo_dir: Path) -> Path | None:
    bin_name = "videolens.exe" if os.name == "nt" else "videolens"
    candidate = repo_dir / ".venv" / ("Scripts" if os.name == "nt" else "bin") / bin_name
    return candidate if candidate.exists() else None


def _build_analyze_command(spec: dict[str, Any], output_dir: Path) -> list[str]:
    _require_fields(spec, "source", "prompt")
    mode = str(spec.get("mode") or "general").strip()
    if mode not in VALID_MODES:
        raise ValueError(f"Unsupported mode: {mode}. Valid modes: {', '.join(sorted(VALID_MODES))}")

    repo_dir = _repo_dir()
    executable = _videolens_executable(repo_dir)
    if executable:
        command = [str(executable), "analyze"]
    elif _uv_command():
        command = [str(_uv_command()), "run", "videolens", "analyze"]
    else:
        command = [str(_venv_python(repo_dir)), "-m", "videolens.cli", "analyze"]

    command.extend(
        [
            str(spec["source"]),
            "--mode",
            mode,
            "--prompt",
            str(spec["prompt"]),
            "--output-dir",
            str(output_dir),
            "--max-frames",
            str(_bounded_int(spec.get("max_frames"), default=40, minimum=1, maximum=80, name="max_frames")),
            "--frame-interval",
            str(
                _bounded_float(
                    spec.get("frame_interval"),
                    default=5.0,
                    minimum=1.0,
                    maximum=600.0,
                    name="frame_interval",
                )
            ),
            "--capture-duration",
            str(
                _bounded_float(
                    spec.get("capture_duration"),
                    default=60.0,
                    minimum=1.0,
                    maximum=900.0,
                    name="capture_duration",
                )
            ),
            "--json",
        ]
    )
    if spec.get("force"):
        command.append("--force")
    if spec.get("verbose"):
        command.append("--verbose")
    return command


def _run_analyze(spec: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    repo_dir = _repo_dir()
    output_dir = _new_run_dir(spec)
    output_dir.mkdir(parents=True, exist_ok=True)
    result = _run_command(
        _build_analyze_command(spec, output_dir),
        env=os.environ.copy(),
        cwd=repo_dir,
        timeout=_bounded_int(
            spec.get("command_timeout_seconds"),
            default=1800,
            minimum=60,
            maximum=7200,
            name="command_timeout_seconds",
        ),
    )
    report_html = output_dir / "report.html"
    report_markdown = output_dir / "report.md"
    analysis_json = output_dir / "analysis.json"
    artifacts_ready = report_html.exists() and report_markdown.exists() and analysis_json.exists()
    return {
        "success": result["success"] and artifacts_ready,
        "summary": "VideoLens analysis completed" if result["success"] and artifacts_ready else "VideoLens analysis failed",
        "action": "analyze",
        "mode": str(spec.get("mode") or "general"),
        "output_dir": str(output_dir),
        "report_html_path": str(report_html) if report_html.exists() else None,
        "report_markdown_path": str(report_markdown) if report_markdown.exists() else None,
        "analysis_json_path": str(analysis_json) if analysis_json.exists() else None,
        "command": result["command"],
        "returncode": result["returncode"],
        "stdout": result["stdout"],
        "stderr": result["stderr"],
        "state": state,
    }


def _execute_spec(spec: dict[str, Any]) -> dict[str, Any]:
    action = str(spec.get("action") or "preflight").strip()
    state = _collect_runtime_state()

    if action == "preflight":
        return _build_preflight_report(spec, state)

    if action in SPEND_ACTIONS and not bool(spec.get("allow_credit_spend")):
        return {
            "success": False,
            "summary": f"Refusing {action} without allow_credit_spend=true",
            "action": action,
            "state": state,
            "error": "Set allow_credit_spend to true only after the user confirms model/API usage.",
        }

    if action in {"bootstrap", "analyze"}:
        repo_result = _ensure_repo(spec)
        if not repo_result["success"]:
            return {
                "success": False,
                "summary": "Failed to prepare the pinned VideoLens runtime",
                "action": action,
                "step": "git",
                "result": repo_result,
                "state": _collect_runtime_state(),
            }
        runtime_result = _ensure_runtime(spec)
        if not runtime_result["success"]:
            return {
                "success": False,
                "summary": "Failed to prepare the VideoLens Python environment",
                "action": action,
                "step": "runtime",
                "result": runtime_result,
                "state": _collect_runtime_state(),
            }
        state = _collect_runtime_state()
        if action == "bootstrap":
            return {
                "success": True,
                "summary": "VideoLens bootstrap completed",
                "action": action,
                "git": repo_result,
                "runtime": runtime_result,
                "state": state,
            }
        if not state["openai_api_key_present"]:
            return {
                "success": False,
                "summary": "OPENAI_API_KEY is missing",
                "action": action,
                "state": state,
                "error": "Configure OPENAI_API_KEY before running local VideoLens analysis.",
            }
        return _run_analyze(spec, state)

    raise ValueError(f"Unsupported action: {action}")


def run(context: dict[str, Any]) -> dict[str, Any]:
    """OCC-compatible entry point."""
    try:
        task_payload = _fetch_task_payload(context)
        spec = _parse_task_spec(str(task_payload.get("pre_instructions") or ""))
        return _execute_spec(spec)
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return {
            "success": False,
            "summary": f"Failed to load task configuration: HTTP {exc.code}",
            "error": body or str(exc),
            "action": "preflight",
        }
    except Exception as exc:
        return {
            "success": False,
            "summary": f"VideoLens wrapper failed: {exc}",
            "error": str(exc),
            "context": _json_safe(context),
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Portable VideoLens OpenClaw skill runner")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--spec", help="JSON/YAML action object")
    source.add_argument("--spec-file", type=Path, help="Path to a JSON/YAML action file")
    args = parser.parse_args(argv)

    try:
        raw = args.spec_file.read_text(encoding="utf-8") if args.spec_file else (args.spec or "")
        result = _execute_spec(_parse_task_spec(raw))
    except Exception as exc:
        result = {"success": False, "summary": f"VideoLens wrapper failed: {exc}", "error": str(exc)}
    print(json.dumps(_json_safe(result), indent=2, sort_keys=True))
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(main())
