from pathlib import Path

from streamlit.testing.v1 import AppTest


APP_PATH = Path(__file__).parents[1] / "src" / "videolens" / "web" / "app.py"


def test_first_run_exposes_sample_without_api_key() -> None:
    app = AppTest.from_file(str(APP_PATH), default_timeout=20).run()

    assert not app.exception
    assert "View a sample report" in [button.label for button in app.button]
    assert "Create evidence report" in [button.label for button in app.button]
    assert any("sample report needs no key" in info.value for info in app.info)


def test_sample_report_opens_without_external_services() -> None:
    app = AppTest.from_file(str(APP_PATH), default_timeout=20).run()
    sample_button = next(button for button in app.button if button.label == "View a sample report")

    sample_button.click().run()

    assert not app.exception
    assert any("Illustrative sample" in success.value for success in app.success)
    assert "Download sample issue" in [button.label for button in app.get("download_button")]
    assert "Analyze your own recording" in [button.label for button in app.button]
