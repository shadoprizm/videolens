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


def test_analyze_command_supports_all_modes_and_current_flags(
    skill: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    repo_dir = tmp_path / "videolens"
    executable = repo_dir / ".venv" / "bin" / "videolens"
    executable.parent.mkdir(parents=True)
    executable.touch()
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
        assert command[:2] == [str(executable), "analyze"]
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
        if command[1:3] == ["-m", "venv"]:
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
    assert calls[1][0] == str(repo_dir / ".venv" / "bin" / "python")
    assert calls[1][-2:] == ["-e", ".[ui]"]


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
    monkeypatch.setattr(skill, "_build_analyze_command", lambda *_: ["videolens", "analyze"])

    def fake_run(command: list[str], **_: object) -> dict[str, object]:
        for name in ("report.html", "report.md", "analysis.json"):
            (output_dir / name).write_text("{}", encoding="utf-8")
        return {
            "success": True,
            "command": command,
            "returncode": 0,
            "stdout": "ok",
            "stderr": "",
        }

    monkeypatch.setattr(skill, "_run_command", fake_run)
    result = skill._run_analyze({"mode": "general"}, {})

    assert result["success"] is True
    assert result["report_html_path"].endswith("report.html")
    assert result["report_markdown_path"].endswith("report.md")
    assert result["analysis_json_path"].endswith("analysis.json")
