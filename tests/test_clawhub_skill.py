from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

from videolens.types import AnalysisMode


SKILL_PATH = Path(__file__).parents[1] / "skills" / "videolens" / "skill.py"


def _load_skill() -> ModuleType:
    spec = importlib.util.spec_from_file_location("videolens_clawhub_skill", SKILL_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def skill() -> ModuleType:
    return _load_skill()


def test_skill_modes_match_the_product_enum(skill: ModuleType) -> None:
    assert skill.VALID_MODES == {mode.value for mode in AnalysisMode}


def test_parse_task_spec_accepts_json_and_fenced_json(skill: ModuleType) -> None:
    expected = {"action": "analyze", "mode": "tutorial"}
    assert skill._parse_task_spec(json.dumps(expected)) == expected
    assert skill._parse_task_spec(f"```json\n{json.dumps(expected)}\n```") == expected


def test_analysis_requires_explicit_credit_approval(skill: ModuleType, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(skill, "_collect_runtime_state", lambda: {"ready": True})
    result = skill._execute_spec(
        {
            "action": "analyze",
            "source": "https://youtube.com/watch?v=test",
            "prompt": "Create a report.",
        }
    )
    assert result["success"] is False
    assert "allow_credit_spend=true" in result["summary"]


def test_bootstrap_requires_explicit_runtime_install_approval(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(skill, "_collect_runtime_state", lambda: {"runtime_ready": False})
    monkeypatch.setattr(
        skill,
        "_ensure_repo",
        lambda _: pytest.fail("bootstrap must not start before approval"),
    )

    result = skill._execute_spec({"action": "bootstrap"})

    assert result["success"] is False
    assert "allow_runtime_install=true" in result["summary"]
    assert "GitHub" in result["error"]


def test_ready_analysis_does_not_reinstall_the_runtime(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = {"runtime_ready": True, "openai_api_key_present": True}
    monkeypatch.setattr(skill, "_collect_runtime_state", lambda: state)
    monkeypatch.setattr(
        skill,
        "_ensure_repo",
        lambda _: pytest.fail("ready analysis must not fetch the repository"),
    )
    monkeypatch.setattr(
        skill,
        "_ensure_runtime",
        lambda _: pytest.fail("ready analysis must not install dependencies"),
    )
    monkeypatch.setattr(skill, "_run_analyze", lambda _spec, received: {"state": received})

    result = skill._execute_spec(
        {"action": "analyze", "allow_credit_spend": True}
    )

    assert result == {"state": state}


def test_analysis_never_bootstraps_without_separate_install_approval(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        skill,
        "_collect_runtime_state",
        lambda: {"runtime_ready": False, "openai_api_key_present": True},
    )
    monkeypatch.setattr(
        skill,
        "_ensure_repo",
        lambda _: pytest.fail("analysis must not bootstrap without install approval"),
    )

    result = skill._execute_spec(
        {"action": "analyze", "allow_credit_spend": True}
    )

    assert result["success"] is False
    assert "allow_runtime_install=true" in result["summary"]


def test_analysis_subprocess_receives_only_allowlisted_environment(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(skill, "_state_root", lambda: tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "expected-openai-key")
    monkeypatch.setenv("UNRELATED_SECRET", "must-not-leak")
    monkeypatch.setenv("DATABASE_URL", "must-not-leak")

    base_env = skill._sanitized_base_env()
    analysis_env = skill._analysis_env()

    assert "OPENAI_API_KEY" not in base_env
    assert "UNRELATED_SECRET" not in base_env
    assert "DATABASE_URL" not in base_env
    assert analysis_env["OPENAI_API_KEY"] == "expected-openai-key"
    assert "UNRELATED_SECRET" not in analysis_env
    assert "DATABASE_URL" not in analysis_env
    assert analysis_env["HOME"].startswith(str(tmp_path))
    assert analysis_env["VIDEOLENS_CACHE_DIR"].startswith(str(tmp_path))
    assert analysis_env["PYTHONPATH"].startswith(str(tmp_path))


def test_default_subprocess_environment_is_sanitized(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setattr(skill, "_state_root", lambda: tmp_path)
    monkeypatch.setenv("UNRELATED_SECRET", "must-not-leak")

    class Completed:
        returncode = 0
        stdout = "ok"
        stderr = ""

    def fake_run(command: list[str], **kwargs: object) -> Completed:
        captured.update(kwargs)
        return Completed()

    monkeypatch.setattr(skill.subprocess, "run", fake_run)
    assert skill._run_command(["git", "--version"])["success"] is True

    child_env = captured["env"]
    assert isinstance(child_env, dict)
    assert "UNRELATED_SECRET" not in child_env
    assert child_env["HOME"].startswith(str(tmp_path))
    assert child_env["TMPDIR"].startswith(str(tmp_path))


def test_task_api_is_restricted_to_loopback_and_encodes_task_id(skill: ModuleType) -> None:
    url = skill._task_api_url(
        {"task_id": "../../private?view=1", "gateway_url": "http://127.0.0.1:18789"}
    )
    assert url == "http://127.0.0.1:18789/api/tasks/..%2F..%2Fprivate%3Fview%3D1"

    for unsafe in (
        "https://127.0.0.1:18789",
        "http://example.com:18789",
        "http://127.0.0.1:18789/admin",
        "http://user:password@127.0.0.1:18789",
    ):
        with pytest.raises(ValueError, match="loopback"):
            skill._task_api_url({"task_id": "task-1", "gateway_url": unsafe})


def test_wrapper_errors_do_not_echo_context_secrets(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        skill,
        "_fetch_task_payload",
        lambda _: (_ for _ in ()).throw(ValueError("invalid task")),
    )
    result = skill.run({"token": "do-not-echo", "pre_instructions": "private"})

    assert "do-not-echo" not in json.dumps(result)
    assert "private" not in json.dumps(result)


def test_analyze_command_supports_all_modes_and_current_flags(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    repo_dir = tmp_path / "videolens"
    venv_python = repo_dir / ".venv" / "bin" / "python"
    venv_python.parent.mkdir(parents=True)
    venv_python.touch()
    monkeypatch.setattr(skill, "_repo_dir", lambda: repo_dir)

    for mode in skill.VALID_MODES:
        command = skill._build_analyze_command(
            {
                "source": "sample.mp4",
                "prompt": "Create an evidence-grounded report.",
                "mode": mode,
                "capture_duration": 90,
            },
            tmp_path / "output",
        )
        assert command[:4] == [str(venv_python), "-m", "videolens.cli", "analyze"]
        assert command[command.index("--mode") + 1] == mode
        assert command[command.index("--capture-duration") + 1] == "90.0"
        assert "--json" in command


def test_python_fallback_creates_a_venv_and_installs_runtime(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    repo_dir = tmp_path / "videolens"
    repo_dir.mkdir()
    calls: list[list[str]] = []
    monkeypatch.setattr(skill, "_repo_dir", lambda: repo_dir)
    monkeypatch.setattr(skill, "_uv_command", lambda: None)

    def fake_run(command: list[str], **_: object) -> dict[str, object]:
        calls.append(command)
        if "venv" in command:
            venv_python = repo_dir / ".venv" / "bin" / "python"
            venv_python.parent.mkdir(parents=True)
            venv_python.touch()
        return {
            "success": True,
            "command": command,
            "returncode": 0,
            "stdout": "ok",
            "stderr": "",
        }

    monkeypatch.setattr(skill, "_run_command", fake_run)
    result = skill._ensure_runtime({})

    assert result["success"] is True
    assert calls[0][1:3] == ["-m", "venv"]
    assert "--clear" in calls[0]
    assert calls[1][0] == str(repo_dir / ".venv" / "bin" / "python")
    assert "--no-input" in calls[1]
    assert "--disable-pip-version-check" in calls[1]
    assert "--require-hashes" in calls[1]
    assert calls[1][-2:] == ["--requirement", str(skill.LOCKED_REQUIREMENTS)]
    stamp = json.loads(skill._runtime_stamp_path(repo_dir).read_text(encoding="utf-8"))
    assert stamp["runtime_ref"] == skill.RUNTIME_REF
    assert stamp["requirements_sha256"] == skill._requirements_digest()
    assert stamp["installer"] == "pip"


def test_uv_runtime_install_recreates_a_minimal_hash_locked_environment(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(skill, "_repo_dir", lambda: tmp_path)
    monkeypatch.setattr(skill, "_uv_command", lambda: "/usr/local/bin/uv")

    def fake_run(command: list[str], **_: object) -> dict[str, object]:
        calls.append(command)
        if command[1] == "venv":
            venv_python = tmp_path / ".venv" / "bin" / "python"
            venv_python.parent.mkdir(parents=True)
            venv_python.touch()
        return {
            "success": True,
            "returncode": 0,
            "stdout": "ok",
            "stderr": "",
        }

    monkeypatch.setattr(skill, "_run_command", fake_run)

    assert skill._ensure_runtime({})["success"] is True
    assert calls[0][0:2] == ["/usr/local/bin/uv", "venv"]
    assert "--clear" in calls[0]
    assert calls[1][0:3] == ["/usr/local/bin/uv", "pip", "install"]
    assert "--require-hashes" in calls[1]
    assert calls[1][-2:] == ["--requirement", str(skill.LOCKED_REQUIREMENTS)]
    assert skill._runtime_stamp_matches(tmp_path) is True


def test_analyze_command_never_uses_uv_run(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    repo_dir = tmp_path / "videolens"
    venv_python = repo_dir / ".venv" / "bin" / "python"
    venv_python.parent.mkdir(parents=True)
    venv_python.touch()
    monkeypatch.setattr(skill, "_repo_dir", lambda: repo_dir)
    monkeypatch.setattr(skill, "_uv_command", lambda: "/usr/local/bin/uv")

    command = skill._build_analyze_command(
        {"source": "sample.mp4", "prompt": "Summarize it."}, tmp_path / "output"
    )

    assert command[:4] == [str(venv_python), "-m", "videolens.cli", "analyze"]
    assert "uv" not in " ".join(command)


def test_run_directory_cannot_escape_the_managed_runs_root(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    runs_dir = tmp_path / "runs"
    monkeypatch.setattr(skill, "_runs_dir", lambda: runs_dir)
    output = skill._new_run_dir({"run_id": "../../outside/report"})
    assert output.parent == runs_dir
    assert output.name == "outside-report"


def test_analyze_result_reports_all_local_artifacts(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    output_dir = tmp_path / "run"
    repo_dir = tmp_path / "repo"
    repo_dir.mkdir()
    monkeypatch.setattr(skill, "_repo_dir", lambda: repo_dir)
    monkeypatch.setattr(skill, "_new_run_dir", lambda _: output_dir)
    monkeypatch.setattr(
        skill,
        "_build_analyze_command",
        lambda *_: [
            "videolens",
            "analyze",
            "private-video.mp4",
            "--prompt",
            "private analysis prompt",
        ],
    )

    def fake_run(command: list[str], **_: object) -> dict[str, object]:
        for name in ("report.html", "report.md", "analysis.json"):
            (output_dir / name).write_text("{}", encoding="utf-8")
        return {
            "success": True,
            "command": command,
            "returncode": 0,
            "stdout": "processed private-video.mp4 with private analysis prompt",
            "stderr": "key=private-api-key",
        }

    monkeypatch.setattr(skill, "_run_command", fake_run)
    monkeypatch.setenv("OPENAI_API_KEY", "private-api-key")
    result = skill._run_analyze(
        {
            "mode": "general",
            "source": "private-video.mp4",
            "prompt": "private analysis prompt",
        },
        {},
    )

    assert result["success"] is True
    assert result["report_html_path"].endswith("report.html")
    assert result["report_markdown_path"].endswith("report.md")
    assert result["analysis_json_path"].endswith("analysis.json")
    rendered_command = " ".join(result["command"])
    assert "private-video.mp4" not in rendered_command
    assert "private analysis prompt" not in rendered_command
    assert "<user-selected-video>" in rendered_command
    assert "<user-prompt>" in rendered_command
    assert "private-video.mp4" not in result["stdout"]
    assert "private analysis prompt" not in result["stdout"]
    assert "private-api-key" not in result["stderr"]


def test_skill_manifest_declares_narrow_tooling_and_sensitive_side_effects() -> None:
    manifest = SKILL_PATH.with_name("SKILL.md").read_text(encoding="utf-8")
    assert "allowed-tools:\n  - Bash(python3:*)" in manifest
    assert "allow_runtime_install" in manifest
    assert "selected video's extracted audio, frames, transcript" in manifest
    assert "does not receive unrelated host environment variables" in manifest
    assert "hash-verified requirements file" in manifest
