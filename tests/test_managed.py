import io
import re
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from videolens import managed
from videolens.managed import Connection, ManagedClient, ManagedError, Pairing


class Recorder:
    def __init__(self, *responses: httpx.Response):
        self.responses = list(responses)
        self.calls: list[dict] = []

    def __call__(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, **kwargs})
        return self.responses.pop(0)


def _response(status: int, body: dict) -> httpx.Response:
    return httpx.Response(status, json=body, request=httpx.Request("GET", "https://videolens.io"))


@pytest.fixture
def recorder(monkeypatch):
    def install(*responses):
        rec = Recorder(*responses)
        monkeypatch.setattr(managed.httpx, "request", rec)
        return rec

    return install


CONNECTION = Connection(token="jwt", email="member@example.com", device_id="web-abc12345")


def test_pairing_matches_server_validation() -> None:
    pairing = Pairing.new()
    # site/api/extension-authorize.ts accepts 40-100 URL-safe characters.
    assert re.fullmatch(r"[A-Za-z0-9_-]{40,100}", pairing.nonce)
    assert pairing.device_id.startswith("web-") and len(pairing.device_id) >= 8
    query = parse_qs(urlparse(pairing.approve_url()).query)
    assert query == {"connect": [pairing.nonce], "device": [pairing.device_id], "client": ["web"]}


def test_poll_pairing_waits_then_connects(recorder) -> None:
    rec = recorder(
        _response(202, {"status": "pending"}),
        _response(200, {"status": "connected", "token": "jwt", "email": "member@example.com"}),
    )
    pairing = Pairing.new()
    assert managed.poll_pairing(pairing) is None
    connection = managed.poll_pairing(pairing)
    assert connection == Connection("jwt", "member@example.com", pairing.device_id)
    assert rec.calls[0]["params"] == {"nonce": pairing.nonce, "device_id": pairing.device_id}


def test_expired_pairing_raises_user_message(recorder) -> None:
    recorder(
        _response(
            410, {"error": "pairing_expired", "message": "This extension connection has expired."}
        )
    )
    with pytest.raises(ManagedError, match="expired") as info:
        managed.poll_pairing(Pairing.new())
    assert info.value.code == "pairing_expired"


def test_reserve_and_complete_never_cloud_save(recorder) -> None:
    rec = recorder(
        _response(201, {"reservation": {"reportId": "r-1", "plan": "free", "used": 1, "limit": 3}}),
        _response(200, {"reportId": "r-1", "saved": False}),
    )
    assert managed.reserve_report(CONNECTION) == "r-1"
    managed.complete_report(
        CONNECTION,
        "r-1",
        failed=True,
        title="T",
        source_type="youtube",
        mode="general",
        failure_stage="source",
        failure_code="source",
    )
    reserve, complete = rec.calls
    assert reserve["headers"]["Authorization"] == "Bearer jwt"
    assert reserve["json"] == {"action": "reserve", "deviceId": "web-abc12345", "cloudSave": False}
    assert complete["json"]["status"] == "failed"
    assert complete["json"]["cloudSave"] is False
    assert complete["json"]["failureStage"] == "source"


def test_quota_exhausted_surfaces_status(recorder) -> None:
    recorder(
        _response(
            402,
            {
                "error": "managed_report_quota_exhausted",
                "message": "Your managed-report allowance is used up.",
            },
        )
    )
    with pytest.raises(ManagedError) as info:
        managed.reserve_report(CONNECTION)
    assert info.value.status == 402


def test_managed_chat_matches_proxy_contract(recorder) -> None:
    rec = recorder(_response(200, {"choices": [{"message": {"content": '{"ok": true}'}}]}))
    client = ManagedClient(CONNECTION, "r-1")
    response = client.chat.completions.create(
        model="gpt-5.6-terra",
        messages=[{"role": "user", "content": "hi"}],
        response_format={"type": "json_object"},
        reasoning_effort="none",
        max_completion_tokens=50,
    )
    assert response.choices[0].message.content == '{"ok": true}'
    body = rec.calls[0]["json"]
    assert body == {
        "reportId": "r-1",
        "model": "gpt-5.6-terra",
        "messages": [{"role": "user", "content": "hi"}],
        "jsonObject": True,
        "reasoning_effort": "none",
    }


def test_managed_transcription_sends_report_id(recorder) -> None:
    rec = recorder(_response(200, {"text": "hello world"}))
    client = ManagedClient(CONNECTION, "r-1")
    audio = io.BytesIO(b"mp3-bytes")
    audio.name = "/tmp/chunk_0001.mp3"
    response = client.audio.transcriptions.create(model="gpt-4o-mini-transcribe", file=audio)
    assert response.text == "hello world"
    call = rec.calls[0]
    assert call["data"] == {"reportId": "r-1", "model": "gpt-4o-mini-transcribe"}
    assert call["files"]["file"][0] == "chunk_0001.mp3"


def test_managed_defaults_fit_proxy_limits() -> None:
    # 64 kbps mono chunks must stay under the 4 MB proxy body limit, and frames
    # must leave chat headroom under the 90-request per-report cap.
    assert managed.MANAGED_DEFAULTS.audio_chunk_seconds * 64_000 / 8 < 4_000_000
    assert managed.MANAGED_MAX_FRAMES + 10 <= 90
    assert managed.MANAGED_MODELS.transcribe_diarize == "gpt-transcribe"


def test_completion_retries_transport_failure_without_new_reservation(monkeypatch) -> None:
    calls = []

    def request(method, path, token=None, **kwargs):
        calls.append((path, kwargs["json"]))
        if len(calls) == 1:
            raise ManagedError("Disconnected", code="network")
        return _response(200, {"reportId": "existing-report"})

    monkeypatch.setattr(managed, "_request", request)
    monkeypatch.setattr(managed, "sleep", lambda _: None)
    managed.complete_report(
        CONNECTION,
        "existing-report",
        failed=False,
        title="Report",
        source_type="local_file",
        mode="general",
    )
    assert len(calls) == 2
    assert calls[0] == calls[1]
