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
