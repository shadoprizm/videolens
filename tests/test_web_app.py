from pathlib import Path

from streamlit.testing.v1 import AppTest

from videolens.managed import Connection


APP_PATH = Path(__file__).parents[1] / "src" / "videolens" / "web" / "app.py"


def _app() -> AppTest:
    return AppTest.from_file(str(APP_PATH), default_timeout=20)


def _account(remaining: int, plan: str = "free", founding: bool = True) -> dict:
    limit = 20 if plan == "pro" else 3
    return {
        "entitlement": {
            "plan": plan,
            "managedReportsUsed": limit - remaining,
            "managedReportsLimit": limit,
            "managedReportsRemaining": remaining,
            "purchasedReports": 0,
        },
        "offers": {
            "founding": {
                "available": founding,
                "spotsLeft": 100,
                "spots": 100,
                "percentOff": 40,
                "showCount": False,
            }
        },
    }


def test_first_run_leads_with_free_account_and_sample() -> None:
    app = _app().run()

    assert not app.exception
    labels = [button.label for button in app.button]
    assert "View a sample report" in labels
    assert "Create report" in labels
    assert "Connect my VideoLens account" in labels
    assert "Use my own OpenAI key" in labels
    assert [tab.label for tab in app.tabs[:2]] == ["Paste a YouTube link", "Upload a video file"]


def test_connect_starts_pairing_with_approval_link() -> None:
    app = _app().run()
    next(b for b in app.button if b.label == "Connect my VideoLens account").click().run()

    assert not app.exception
    pairing = app.session_state["pairing"]
    assert pairing.device_id.startswith("web-")
    assert "Cancel" in [button.label for button in app.button]


def test_connected_account_shows_remaining_reports() -> None:
    app = _app()
    app.session_state["connection"] = Connection("token", "member@example.com", "web-device")
    app.session_state["account"] = _account(remaining=2)
    app.run()

    assert not app.exception
    text = " ".join(md.value for md in app.markdown)
    assert "member@example.com" in text
    assert "<strong>2</strong> of 3 free reports left" in text
    assert "Disconnect" in [button.label for button in app.button]


def test_used_allowance_offers_founding_price() -> None:
    app = _app()
    app.session_state["connection"] = Connection("token", "member@example.com", "web-device")
    app.session_state["account"] = _account(remaining=0)
    app.run()

    assert not app.exception
    text = " ".join(md.value for md in app.markdown)
    assert "Founding Member: 40% off Pro for life" in text


def test_create_report_requires_a_connected_account() -> None:
    app = _app().run()
    app.text_input[0].input("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    next(b for b in app.button if b.label == "Create report").click().run()

    assert not app.exception
    assert any("Connect your free VideoLens account first" in error.value for error in app.error)


def test_own_key_mode_reveals_key_field() -> None:
    app = _app().run()
    next(b for b in app.button if b.label == "Use my own OpenAI key").click().run()

    assert not app.exception
    assert app.session_state["use_own_key"] is True
    assert any(field.label == "OpenAI API key" for field in app.text_input)


def test_sample_report_opens_without_external_services() -> None:
    app = _app().run()
    sample_button = next(button for button in app.button if button.label == "View a sample report")

    sample_button.click().run()

    assert not app.exception
    assert any("Illustrative YouTube report" in success.value for success in app.success)
    download_labels = [button.label for button in app.get("download_button")]
    assert {"Download HTML", "Download PDF", "Download Markdown"} <= set(download_labels)
    assert "Analyze a YouTube video" in [button.label for button in app.button]


def test_failed_reports_use_resolver_source_vocabulary(tmp_path) -> None:
    from videolens.web import app as web_app

    upload = tmp_path / "clip.mp4"
    upload.write_bytes(b"")
    assert web_app._source_type(str(upload)) == "local_file"
    assert web_app._source_type("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "youtube"
    assert web_app._source_type("https://www.loom.com/share/abc123") != "youtube"


def test_sound_progress_is_a_separate_stage_before_final_analysis():
    app = AppTest.from_file(str(APP_PATH), default_timeout=20).run()
    assert not app.exception
    # The runtime log used to mark sounds complete during speech transcription,
    # then leave the customer looking at Timeline while the audio model ran.
    from videolens.web.app import STEP_KEYS, _step_index_from_message
    assert STEP_KEYS[_step_index_from_message("transcribing (gpt-transcribe)…")][0] == "transcribe"
    assert STEP_KEYS[_step_index_from_message("analyzing non-speech sounds…")][0] == "sound"
    assert STEP_KEYS[_step_index_from_message("synthesizing analysis…")][0] == "analyze"


def test_successful_empty_speech_is_not_labelled_as_a_transcription_failure():
    app = AppTest.from_string('''
from types import SimpleNamespace
from videolens.types import Transcript
from videolens.web.app import render_transcript_tab
render_transcript_tab(SimpleNamespace(transcript=Transcript()))
''').run()
    assert not app.exception
    assert 'completed with no recognized words' in app.info[0].value
    assert 'does not mean the recording is silent' in app.info[0].value
    assert 'failed' not in app.info[0].value
