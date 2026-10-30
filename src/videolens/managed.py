"""VideoLens account (managed AI) access for the hosted app.

The hosted app connects to a VideoLens account with the same one-time pairing
handshake the browser extension uses, then spends the account's managed-report
allowance through the videolens.io AI proxy. No OpenAI key is involved, and the
account token lives only in server session memory.
"""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4
from time import sleep

import httpx

from videolens.config import Defaults, Models

# The proxy accepts at most 4 MB per request and 45 transcription / 90 chat
# requests per report. 64 kbps mono MP3 chunks of 240 s are about 1.9 MB, so a
# report covers roughly three hours of audio, and capped frames leave headroom
# for synthesis and follow-up questions.
MANAGED_DEFAULTS = Defaults(audio_chunk_seconds=240.0, structured_frame_limit=60)
MANAGED_MAX_FRAMES = 60
# Speaker diarization is not offered by the managed proxy.
MANAGED_MODELS = Models(transcribe_diarize=Models().transcribe_default)

REQUEST_TIMEOUT = httpx.Timeout(120.0, connect=10.0)


def api_base() -> str:
    return (os.environ.get("VIDEOLENS_API_URL") or "https://videolens.io").rstrip("/")


class ManagedError(RuntimeError):
    """A user-facing managed-account failure."""

    def __init__(self, message: str, code: str = "managed_error", status: int | None = None):
        super().__init__(message)
        self.code = code
        self.status = status


@dataclass(frozen=True)
class Pairing:
    nonce: str
    device_id: str

    @classmethod
    def new(cls) -> Pairing:
        return cls(nonce=secrets.token_urlsafe(48), device_id=f"web-{uuid4().hex}")

    def approve_url(self) -> str:
        query = urlencode({"connect": self.nonce, "device": self.device_id, "client": "web"})
        return f"{api_base()}/account?{query}"


@dataclass(frozen=True)
class Connection:
    token: str
    email: str
    device_id: str


def _error_from(response: httpx.Response) -> ManagedError:
    try:
        data = response.json()
    except ValueError:
        data = {}
    error = data.get("error")
    code = error.get("code") if isinstance(error, dict) else error
    message = data.get("message") or (error.get("message") if isinstance(error, dict) else None)
    return ManagedError(
        message or "VideoLens could not complete the request. Please try again.",
        code=str(code or "managed_error"),
        status=response.status_code,
    )


def _request(method: str, path: str, token: str | None = None, **kwargs: Any) -> httpx.Response:
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = httpx.request(
            method, f"{api_base()}{path}", headers=headers, timeout=kwargs.pop("timeout", REQUEST_TIMEOUT), **kwargs
        )
    except httpx.HTTPError as exc:
        raise ManagedError(
            "Could not reach VideoLens. Check your connection and try again.", "network"
        ) from exc
    if response.status_code >= 400:
        raise _error_from(response)
    return response


def poll_pairing(pairing: Pairing) -> Connection | None:
    """Return the connection once the account page approved it, else None."""
    response = _request(
        "GET",
        "/api/extension-token",
        params={"nonce": pairing.nonce, "device_id": pairing.device_id},
    )
    if response.status_code == 202:
        return None
    data = response.json()
    return Connection(
        token=str(data["token"]), email=str(data["email"]), device_id=pairing.device_id
    )


def fetch_account(connection: Connection) -> dict[str, Any]:
    """Entitlement plus any open offers for the connected account."""
    return _request("GET", "/api/entitlement", connection.token).json()


def reserve_report(
    connection: Connection,
    *,
    title: str | None = None,
    source_type: str | None = None,
    mode: str | None = None,
) -> str:
    response = _request(
        "POST",
        "/api/reports",
        connection.token,
        json={
            "action": "reserve",
            "deviceId": connection.device_id,
            "cloudSave": False,
            **({"title": title, "sourceType": source_type, "mode": mode} if source_type else {}),
        },
    )
    return str(response.json()["reservation"]["reportId"])


def complete_report(
    connection: Connection,
    report_id: str,
    *,
    failed: bool,
    title: str,
    source_type: str,
    mode: str,
    failure_stage: str | None = None,
    failure_code: str | None = None,
) -> None:
    body: dict[str, Any] = {
        "action": "complete",
        "reportId": report_id,
        "status": "failed" if failed else "complete",
        "cloudSave": False,
        "title": title[:300] or "Untitled video",
        "sourceType": source_type,
        "mode": mode,
    }
    if failed and failure_stage and failure_code:
        body["failureStage"] = failure_stage
        body["failureCode"] = failure_code
    for attempt in range(3):
        try:
            _request("POST", "/api/reports", connection.token, json=body)
            return
        except ManagedError as exc:
            if attempt == 2 or (exc.status is not None and exc.status < 500 and exc.status != 429):
                raise
            sleep(attempt + 1)


def _namespace(value: Any) -> Any:
    if isinstance(value, dict):
        return SimpleNamespace(**{key: _namespace(item) for key, item in value.items()})
    if isinstance(value, list):
        return [_namespace(item) for item in value]
    return value


class _Completions:
    def __init__(self, client: ManagedClient):
        self._client = client

    def create(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        response_format: dict[str, Any] | None = None,
        temperature: float | None = None,
        reasoning_effort: str | None = None,
        **_: Any,
    ) -> Any:
        body: dict[str, Any] = {
            "reportId": self._client.report_id,
            "model": model,
            "messages": messages,
        }
        # Report quality rules depend on the role, not processor consent.
        if self._client.mode:
            body.update(analysisMode=self._client.mode, purpose=self._client.purpose)
        if self._client.multimodel and self._client.mode == "general":
            body["processingPolicy"] = "managed-providers-2026-10"
        if response_format and response_format.get("type") == "json_object":
            body["jsonObject"] = True
        if temperature is not None:
            body["temperature"] = temperature
        if reasoning_effort is not None:
            body["reasoning_effort"] = reasoning_effort
        response = _request("POST", "/api/ai", self._client.token, json=body)
        return _namespace(response.json())


class _Transcriptions:
    def __init__(self, client: ManagedClient):
        self._client = client

    def create(self, *, model: str, file: Any, **_: Any) -> Any:
        name = Path(getattr(file, "name", "chunk.mp3")).name
        response = _request(
            "POST",
            "/api/ai",
            self._client.token,
            data={"reportId": self._client.report_id, "model": model},
            files={"file": (name, file.read(), "audio/mpeg")},
        )
        return _namespace(response.json())


class ManagedClient:
    """The subset of the OpenAI client the pipeline uses, billed to one report."""

    def __init__(
        self,
        connection: Connection,
        report_id: str,
        *,
        mode: str | None = None,
        multimodel: bool = False,
        sound_consent: bool = False,
    ):
        self.token = connection.token
        self.report_id = report_id
        self.mode = mode
        self.multimodel = multimodel
        self.sound_consent = sound_consent
        self.purpose = "report"
        self.cache_identity = (
            "managed-providers-2026-10" if multimodel and mode == "general"
            else "openai-general-evidence-v2" if mode == "general" else "openai"
        )
        self.chat = SimpleNamespace(completions=_Completions(self))
        self.audio = SimpleNamespace(transcriptions=_Transcriptions(self))

    def analyze_sounds(self, wav: bytes) -> dict[str, Any]:
        if not self.sound_consent:
            raise ManagedError("Accept the sound processing notice first.")
        result = _request("POST", "/api/ai", self.token,
            data={"reportId": self.report_id, "kind": "sound", "processingPolicy": "managed-sounds-2026-10"},
            files={"file": ("sound.wav", wav, "audio/wav")},
            timeout=httpx.Timeout(290.0, connect=10.0)).json()
        if not isinstance(result.get("windows"), list):
            raise ManagedError("Sound analysis returned no valid evidence.")
        return result
