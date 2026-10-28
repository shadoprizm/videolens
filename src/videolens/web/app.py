from __future__ import annotations

import hashlib
import html
import json
import re
from base64 import b64encode
from datetime import timedelta
from pathlib import Path
from time import monotonic
from tempfile import TemporaryDirectory
from urllib.parse import urlencode
from uuid import uuid4

import pandas as pd
import streamlit as st

from videolens.analysis.structured import structured_markdown, fact_text, report_sections
from videolens.config import Config, Defaults, Models
from videolens.managed import (
    MANAGED_DEFAULTS,
    MANAGED_MAX_FRAMES,
    MANAGED_MODELS,
    Connection,
    ManagedClient,
    ManagedError,
    Pairing,
    complete_report,
    fetch_account,
    poll_pairing,
    reserve_report,
)
from videolens.outputs import render_html, render_pdf
from videolens.pipeline import ExtractionResult, run_extraction
from videolens.resolvers.resolve_source import resolve_source
from videolens.product import (
    PRIMARY_WORKFLOWS,
    WORKFLOW_PRESETS,
    build_demo_analysis,
    preset_for,
    preset_for_mode,
    render_report_markdown,
)
from videolens.telemetry import (
    count_bucket,
    duration_bucket,
    latency_bucket,
    track_product_event,
)
from videolens.types import AnalysisMode


ASSETS = Path(__file__).parent / "assets"

st.set_page_config(
    page_title="VideoLens — video to written reports",
    page_icon=str(ASSETS / "favicon.png"),
    layout="wide",
    initial_sidebar_state="collapsed",
)


BRAND_COLOR = "#0891B2"
SITE_URL = "https://videolens.io"
PAIRING_WINDOW = timedelta(minutes=10)


STEP_KEYS: list[tuple[str, str]] = [
    ("resolve", "Resolve"),
    ("fetch", "Fetch"),
    ("probe", "Probe"),
    ("transcribe", "Transcribe"),
    ("frames", "Frames"),
    ("describe", "Describe"),
    ("timeline", "Timeline"),
    ("analyze", "Analyze"),
]


# ───────────────────────── styles ─────────────────────────

# Mirrors videolens.io: Inter, slate text, the cyan brand scale, 12–16px radii and
# soft shadows. Streamlit's own chrome is hidden so the app reads as one product.
STYLES = """
<link rel="preconnect" href="https://rsms.me/">
<link rel="stylesheet" href="https://rsms.me/inter/inter.css">
<style>
:root {
  --vl-ink: #0F172A; --vl-body: #475569; --vl-muted: #64748B; --vl-faint: #94A3B8;
  --vl-line: #E2E8F0; --vl-wash: #F8FAFC; --vl-brand: #0891B2; --vl-brand-dark: #0E7490;
  --vl-brand-wash: #ECFEFF; --vl-indigo: #6366F1;
}
html, body, .stApp, .stMarkdown, .stApp p, .stApp label, button, input, textarea, select {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
}
[data-testid="stIconMaterial"], .material-symbols-rounded {
  font-family: 'Material Symbols Rounded' !important; }
#MainMenu, footer, [data-testid="stToolbar"], [data-testid="stDecoration"],
[data-testid="stStatusWidget"], [data-testid="stSidebarCollapsedControl"] { display: none !important; }
header[data-testid="stHeader"] { background: transparent; height: 0; }
.stApp { background:
  radial-gradient(1100px 420px at 85% -120px, rgba(34,211,238,.13), transparent 70%),
  radial-gradient(900px 380px at -10% -80px, rgba(99,102,241,.08), transparent 70%), #FFFFFF; }
.block-container { max-width: 1120px; padding: 1.25rem 1.25rem 4rem; }
h1, h2, h3, h4 { color: var(--vl-ink); letter-spacing: -0.02em; font-weight: 800 !important; }
p, li { color: var(--vl-body); }
.stButton button p, .stDownloadButton button p, .stLinkButton a p { color: inherit !important; font-weight: 600; }

.vl-nav { display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding: 6px 0 18px; border-bottom: 1px solid var(--vl-line); margin-bottom: 28px; }
.vl-brand { display:flex; align-items:center; gap:10px; text-decoration:none !important; }
.vl-brand img { width: 30px; height: 30px; border-radius: 8px; }
.vl-brand span { font-weight: 800; font-size: 19px; color: var(--vl-ink); letter-spacing:-.02em; }
.vl-links { display:flex; gap:18px; align-items:center; font-size: 14px; }
.vl-links a { color: var(--vl-muted) !important; text-decoration: none !important; font-weight: 500; }
.vl-links a:hover { color: var(--vl-ink) !important; }
.vl-links a.vl-cta { color:#fff !important; background: var(--vl-brand); padding: 8px 14px;
  border-radius: 10px; font-weight: 600; box-shadow: 0 6px 16px -8px rgba(8,145,178,.7); }

.vl-hero h1 { font-size: clamp(30px, 5vw, 46px); line-height: 1.08; margin: 0 0 12px; }
.vl-hero h1 em { font-style: normal; background: linear-gradient(120deg, #0891B2, #6366F1);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.vl-hero p { font-size: 17px; max-width: 640px; margin: 0 0 14px; }
.vl-chips { display:flex; flex-wrap:wrap; gap:8px; margin: 4px 0 26px; }
.vl-chip { font-size: 12.5px; font-weight: 600; color: var(--vl-brand-dark); background: var(--vl-brand-wash);
  border: 1px solid #CFFAFE; border-radius: 999px; padding: 5px 11px; }

.vl-step { display:flex; align-items:center; gap:10px; margin: 6px 0 10px; }
.vl-step b { display:inline-grid; place-items:center; width:26px; height:26px; border-radius:8px;
  background: var(--vl-ink); color:#fff; font-size: 13px; }
.vl-step span { font-weight: 700; color: var(--vl-ink); font-size: 16.5px; }
.vl-hint { color: var(--vl-muted); font-size: 13.5px; margin: -4px 0 10px; }

.st-key-vl_account, .st-key-vl_compose {
  background: #FFFFFF; border: 1px solid var(--vl-line); border-radius: 16px;
  box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 12px 32px -18px rgba(15,23,42,.18); padding: 20px 20px 16px; }
.st-key-vl_account { background: linear-gradient(180deg, #FFFFFF, #F8FAFC); }

.vl-acct-title { font-weight: 800; color: var(--vl-ink); font-size: 17px; margin-bottom: 4px; }
.vl-acct-sub { color: var(--vl-body); font-size: 14px; margin-bottom: 12px; }
.vl-meter { height: 8px; background: #E2E8F0; border-radius: 99px; overflow: hidden; margin: 10px 0 6px; }
.vl-meter i { display:block; height:100%; background: linear-gradient(90deg, #22D3EE, #0891B2); border-radius: 99px; }
.vl-small { font-size: 12.5px; color: var(--vl-muted); }
.vl-offer { margin-top: 12px; padding: 12px 14px; border-radius: 12px; background: #EEF2FF;
  border: 1px solid #C7D2FE; color: #312E81; font-size: 13.5px; }
.vl-offer strong { color: #3730A3; }

.stButton > button, .stDownloadButton > button, .stLinkButton > a {
  border-radius: 12px !important; font-weight: 600 !important; min-height: 42px;
  border: 1px solid var(--vl-line) !important; transition: all .15s ease; }
.stButton > button[kind="primary"], .stLinkButton > a[kind="primary"] {
  background: var(--vl-brand) !important; border-color: var(--vl-brand) !important; color: #fff !important;
  box-shadow: 0 10px 22px -12px rgba(8,145,178,.9); }
.stButton > button[kind="tertiary"] { border: none !important; min-height: auto; padding: 4px 0 !important;
  color: var(--vl-muted) !important; font-weight: 500 !important; }
.stButton > button[kind="tertiary"]:hover { color: var(--vl-ink) !important; text-decoration: underline; }
.stButton > button[kind="primary"]:hover, .stLinkButton > a[kind="primary"]:hover { background: var(--vl-brand-dark) !important; }
.stTextInput input, .stTextArea textarea { border-radius: 12px !important; }
.stTextInput > div > div, .stTextArea > div > div { border-radius: 12px !important; }
[data-testid="stFileUploaderDropzone"] { border-radius: 14px; background: var(--vl-wash); }
[data-baseweb="tab-list"] { gap: 6px; }
[data-testid="stMetric"] { background: var(--vl-wash); border: 1px solid var(--vl-line); border-radius: 12px; padding: 10px 14px; }
[data-testid="stExpander"] details { border-radius: 12px; border-color: var(--vl-line); }
.vl-footer { margin-top: 48px; padding-top: 18px; border-top: 1px solid var(--vl-line);
  display:flex; flex-wrap:wrap; gap:16px; justify-content:space-between; color: var(--vl-faint); font-size: 12.5px; }
.vl-footer a { color: var(--vl-muted) !important; text-decoration: none !important; }
@media (max-width: 640px) {
  .block-container { padding: .75rem 1rem 3rem; }
  .st-key-vl_main > [data-testid="stLayoutWrapper"] > [data-testid="stHorizontalBlock"] { flex-wrap: wrap-reverse; }
  .vl-links a:not(.vl-cta) { display: none; }
  .vl-hero p { font-size: 15.5px; }
}
</style>
"""


def _inject_styles() -> None:
    st.html(STYLES)


def _logo_data_url() -> str:
    svg = (ASSETS / "logo.svg").read_bytes()
    return "data:image/svg+xml;base64," + b64encode(svg).decode("ascii")


def _site_link(path: str, campaign: str) -> str:
    query = urlencode({"utm_source": "web_app", "utm_medium": "web", "utm_campaign": campaign})
    return f"{SITE_URL}{path}?{query}"


# ───────────────────────── helpers ─────────────────────────


def _ensure_product_session() -> None:
    st.session_state.setdefault("product_session_id", uuid4().hex[:16])


def _track_event(event: str, **properties) -> None:
    track_product_event(
        event,
        st.session_state["product_session_id"],
        surface="hosted_app",
        **properties,
    )


def _track_once(key: str, event: str, **properties) -> None:
    state_key = f"telemetry_{key}"
    if st.session_state.get(state_key):
        return
    st.session_state[state_key] = True
    _track_event(event, **properties)


def _apply_entry_params() -> None:
    if st.session_state.get("entry_params_applied"):
        return

    workflow_value = st.query_params.get("workflow")
    if workflow_value in WORKFLOW_PRESETS:
        preset = preset_for(workflow_value)
        st.session_state["workflow"] = workflow_value
        st.session_state["workflow_choice"] = (
            workflow_value if workflow_value in PRIMARY_WORKFLOWS else None
        )
        st.session_state["mode"] = preset.mode.value
        st.session_state["mode_selector"] = preset.mode.value
        st.session_state["prompt_input"] = preset.prompt

    if st.query_params.get("demo") in {"report", "bug"}:
        st.session_state["show_demo"] = True

    st.session_state["entry_params_applied"] = True


def _on_mode_change() -> None:
    mode = st.session_state["mode_selector"]
    preset = preset_for_mode(mode)
    workflow = next(
        (key for key in PRIMARY_WORKFLOWS if WORKFLOW_PRESETS[key].mode.value == mode),
        preset.mode.value,
    )
    st.session_state["mode"] = mode
    st.session_state["workflow"] = workflow
    st.session_state["workflow_choice"] = workflow if workflow in PRIMARY_WORKFLOWS else None
    st.session_state["prompt_input"] = preset.prompt
    _track_event("workflow_selected", workflow=workflow, mode=mode)


def _fmt_ts(seconds: float) -> str:
    s = max(0.0, float(seconds))
    minutes = int(s // 60)
    secs = s - minutes * 60
    return f"{minutes:02d}:{secs:05.2f}"


def _strip_rich_tags(s: str) -> str:
    return re.sub(r"\[/?[a-zA-Z0-9 _#]+\]", "", s)


def _sanitize_filename(s: str) -> str:
    """Strip down to filesystem-safe ASCII-ish characters, collapse whitespace, cap length."""
    s = re.sub(r"[^\w\-.\s]", "", s, flags=re.UNICODE)
    s = re.sub(r"\s+", "_", s.strip())
    s = s.strip("._-")
    return s[:80] or "videolens_analysis"


def _report_preview_url(report_html: str) -> str:
    encoded = b64encode(report_html.encode("utf-8")).decode("ascii")
    return f"data:text/html;base64,{encoded}"


def _output_basename(result: ExtractionResult) -> str:
    """Derive a sensible base filename from the source. Priority:
    1. yt-dlp title (best for YouTube)
    2. video_path stem (uploaded files keep their original name)
    3. generic fallback
    """
    info_path = result.cache.path("ytdlp_info.json")
    if info_path.exists():
        try:
            info = json.loads(info_path.read_text())
            title = (info.get("title") or "").strip()
            if title:
                return _sanitize_filename(title)
        except Exception:
            pass

    stem = result.video_path.stem
    if stem and stem.lower() != "video":
        return _sanitize_filename(stem)

    return "videolens_analysis"


def _session_directory() -> Path:
    if "session_files" not in st.session_state:
        st.session_state["session_files"] = TemporaryDirectory(prefix="videolens-session-")
    return Path(st.session_state["session_files"].name)


def _save_upload(uploaded) -> Path:
    """Keep uploads isolated to this server session for reruns and playback."""
    data = bytes(uploaded.getbuffer())
    h = hashlib.sha256(data).hexdigest()[:16]
    upload_dir = _session_directory() / "uploads" / h
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / Path(uploaded.name).name
    if not dest.exists():
        dest.write_bytes(data)
    return dest


def _estimate_cost(max_frames: int, assumed_minutes: float = 3.0) -> tuple[float, float]:
    """Rough estimate; returns (low, high) USD."""
    per_frame_low, per_frame_high = 0.006, 0.015
    per_min_transcribe = 0.003
    synth_low, synth_high = 0.03, 0.15

    low = (
        min(max_frames, 5) * per_frame_low
        + max(0.5, assumed_minutes * 0.3) * per_min_transcribe
        + synth_low
    )
    high = max_frames * per_frame_high + (assumed_minutes * 1.5) * per_min_transcribe + synth_high
    return low, high


def _step_index_from_message(msg: str) -> int | None:
    msg_low = msg.lower()
    if "resolving:" in msg_low or "type=" in msg_low:
        return 0
    if "fetching video" in msg_low or "cached video" in msg_low:
        return 1
    if "probing metadata" in msg_low or "cached metadata" in msg_low:
        return 2
    if (
        "extracting frames" in msg_low
        or "extracting evidence frames" in msg_low
        or "cached frames" in msg_low
    ):
        return 4
    if (
        "extracting audio" in msg_low
        or "cached audio" in msg_low
        or "chunking audio" in msg_low
        or "transcribing" in msg_low
        or "cached transcript" in msg_low
    ):
        return 3
    if "describing" in msg_low or "cached frame summaries" in msg_low or "described " in msg_low:
        return 5
    if "building timeline" in msg_low or "cached timeline" in msg_low:
        return 6
    if "synthesizing analysis" in msg_low or "cached analysis" in msg_low:
        return 7
    return None


def _render_stepper(state: list[str]) -> str:
    """state[i] in {'pending','running','complete'}. Returns HTML."""
    icons = {"pending": "○", "running": "●", "complete": "✓"}
    colors = {"pending": "#94A3B8", "running": BRAND_COLOR, "complete": "#10B981"}
    chips = []
    for i, (_, label) in enumerate(STEP_KEYS):
        s = state[i] if i < len(state) else "pending"
        chip = (
            f'<span style="display:inline-flex;align-items:center;gap:6px;'
            f"padding:6px 10px;margin:2px 4px;border-radius:14px;"
            f"background:{colors[s]}15;color:{colors[s]};"
            f'font-size:12.5px;font-weight:600;border:1px solid {colors[s]}40;">'
            f"{icons[s]} {label}</span>"
        )
        chips.append(chip)
    return '<div style="display:flex;flex-wrap:wrap;line-height:1.8">' + "".join(chips) + "</div>"


def _mode_description(mode: str) -> str:
    return {
        "general": "Detailed written report: main ideas, important evidence, context, and takeaways.",
        "bug": "Bug recording: repro steps, severity, ticket-ready summary.",
        "meeting": "Interviews, podcasts, and meetings: themes, arguments, decisions, and follow-ups.",
        "ux": "Session replay: user intent, friction points, abandoned flows, UI/copy fixes.",
        "tutorial": "Software walkthrough: sourced prerequisites, exact settings, steps, checks, and missing details.",
        "recipe": "Cooking video: ingredients and steps with separate evidence for quantities, timings, and temperatures.",
        "product_demo": "Product demo: feature inventory, positioning, strengths/weaknesses, opportunities.",
        "content": "Content critique: hook, pacing, clarity, claims/proof, suggested edits.",
        "privacy": "Privacy review: visible secrets, credentials, PII, internal URLs — redaction plan.",
        "production_recipe": "Reference video: script spine, shots, edit rhythm, likely tools, assets, and recreation plan.",
    }.get(mode, "")


def _step(number: int, title: str, hint: str | None = None) -> None:
    st.markdown(
        f'<div class="vl-step"><b>{number}</b><span>{html.escape(title)}</span></div>'
        + (f'<div class="vl-hint">{html.escape(hint)}</div>' if hint else ""),
        unsafe_allow_html=True,
    )


# ───────────────────────── account access ─────────────────────────


def _connection() -> Connection | None:
    return st.session_state.get("connection")


def _account() -> dict | None:
    """Cached entitlement for the connected account; refreshed after each report."""
    connection = _connection()
    if connection is None:
        return None
    if st.session_state.get("account") is None:
        try:
            st.session_state["account"] = fetch_account(connection)
        except ManagedError as exc:
            if exc.status in (401, 403):
                _disconnect()
                st.session_state["account_notice"] = "Your VideoLens session expired. Connect again to continue."
                return None
            raise
    return st.session_state["account"]


def _disconnect() -> None:
    for key in ("connection", "account", "pairing", "pairing_started"):
        st.session_state.pop(key, None)


def _access_mode() -> str:
    """'account' when a connected account can run a managed report, else 'byok'."""
    if st.session_state.get("use_own_key"):
        return "byok"
    return "account"


def _remaining_reports(account: dict | None) -> int:
    if not account:
        return 0
    entitlement = account.get("entitlement", {})
    return int(entitlement.get("managedReportsRemaining") or 0) + int(
        entitlement.get("purchasedReports") or 0
    )


def _start_pairing() -> None:
    st.session_state["pairing"] = Pairing.new()
    st.session_state["pairing_started"] = monotonic()
    st.session_state.pop("account_notice", None)
    _track_event("account_connect_started")


@st.fragment(run_every=2)
def _pairing_watcher() -> None:
    pairing: Pairing | None = st.session_state.get("pairing")
    if pairing is None:
        return
    if monotonic() - st.session_state.get("pairing_started", 0) > PAIRING_WINDOW.total_seconds():
        _disconnect()
        st.session_state["account_notice"] = "That connection request expired. Start again."
        st.rerun()
    try:
        connection = poll_pairing(pairing)
    except ManagedError as exc:
        _disconnect()
        st.session_state["account_notice"] = str(exc)
        st.rerun()
        return
    if connection is None:
        st.markdown(
            '<div class="vl-small">Waiting for you to approve the connection in the VideoLens tab…</div>',
            unsafe_allow_html=True,
        )
        return
    st.session_state.pop("pairing", None)
    st.session_state["connection"] = connection
    st.session_state["account"] = None
    _track_event("account_connected")
    st.rerun()


def _founding_offer_html(account: dict) -> str:
    founding = (account.get("offers") or {}).get("founding") or {}
    if not founding.get("available"):
        return (
            '<div class="vl-offer"><strong>Keep creating with Pro.</strong> 20 reports a month, '
            "no API key, cancel anytime.</div>"
        )
    percent = int(founding.get("percentOff") or 40)
    spots = (
        f" {founding['spotsLeft']} of {founding['spots']} spots left."
        if founding.get("showCount")
        else f" Limited to the first {founding.get('spots', 100)} members."
    )
    return (
        f'<div class="vl-offer"><strong>Founding Member: {percent}% off Pro for life.</strong> '
        f"20 reports a month, no API key, cancel anytime.{html.escape(spots)}</div>"
    )


def _render_account_panel() -> None:
    with st.container(key="vl_account"):
        notice = st.session_state.pop("account_notice", None)
        if notice:
            st.warning(notice)

        if st.session_state.get("use_own_key"):
            st.markdown(
                '<div class="vl-acct-title">Using your OpenAI key</div>'
                '<div class="vl-acct-sub">Kept in server session memory only and never saved. '
                "You pay OpenAI directly for usage.</div>",
                unsafe_allow_html=True,
            )
            api_key = st.text_input(
                "OpenAI API key",
                value=st.session_state.get("api_key", ""),
                type="password",
                placeholder="sk-...",
                label_visibility="collapsed",
            )
            st.session_state["api_key"] = api_key.strip()
            if st.button("Use my free VideoLens account instead", use_container_width=True):
                st.session_state["use_own_key"] = False
                st.rerun()
            return

        connection = _connection()
        if connection is None:
            st.markdown(
                '<div class="vl-acct-title">Your free reports are waiting</div>'
                '<div class="vl-acct-sub">Connect your VideoLens account to create reports here. '
                "3 free reports, no API key, no install. Works on phone and desktop.</div>",
                unsafe_allow_html=True,
            )
            pairing: Pairing | None = st.session_state.get("pairing")
            if pairing is None:
                if st.button("Connect my VideoLens account", type="primary", use_container_width=True):
                    _start_pairing()
                    st.rerun()
                st.markdown(
                    '<div class="vl-small">New here? You can create your free account in the next step. '
                    "Just your email.</div>",
                    unsafe_allow_html=True,
                )
            else:
                st.link_button(
                    "Approve in VideoLens ↗", pairing.approve_url(), type="primary", use_container_width=True
                )
                _pairing_watcher()
                if st.button("Cancel", use_container_width=True):
                    _disconnect()
                    st.rerun()
            if st.button("Use my own OpenAI key", type="tertiary"):
                st.session_state["use_own_key"] = True
                _track_event("byok_selected")
                st.rerun()
            return

        try:
            account = _account()
        except ManagedError as exc:
            st.error(str(exc))
            return
        if account is None:
            st.rerun()
            return
        entitlement = account.get("entitlement", {})
        plan = entitlement.get("plan", "free")
        used = int(entitlement.get("managedReportsUsed") or 0)
        limit = max(1, int(entitlement.get("managedReportsLimit") or 3))
        remaining = _remaining_reports(account)
        label = "Pro" if plan == "pro" else "Free account"
        period = "this month" if plan == "pro" else "free reports"
        st.markdown(
            f'<div class="vl-acct-title">{label}</div>'
            f'<div class="vl-acct-sub">{html.escape(connection.email)}</div>'
            f'<div class="vl-meter"><i style="width:{min(100, round(used / limit * 100))}%"></i></div>'
            f'<div class="vl-small"><strong>{remaining}</strong> of {limit} {period} left. '
            "Failed reports never use your allowance.</div>",
            unsafe_allow_html=True,
        )
        if remaining <= 0:
            st.markdown(_founding_offer_html(account), unsafe_allow_html=True)
            st.link_button(
                "See Pro options ↗",
                _site_link("/account", "web_app_upgrade"),
                type="primary",
                use_container_width=True,
            )
        elif plan != "pro" and remaining == 1:
            st.markdown(_founding_offer_html(account), unsafe_allow_html=True)
        col_a, col_b = st.columns(2)
        col_a.link_button(
            "My account ↗", _site_link("/account", "web_app_account"), use_container_width=True
        )
        if col_b.button("Disconnect", use_container_width=True):
            _disconnect()
            st.rerun()


# ───────────────────────── layout ─────────────────────────


def main() -> None:
    _ensure_product_session()
    _apply_entry_params()
    _track_once("app_open", "app_open")
    _inject_styles()

    _render_header()

    if st.session_state.get("show_demo"):
        _render_demo_report()
        _render_footer()
        return

    main_area = st.container(key="vl_main")
    compose_col, account_col = main_area.columns([1.65, 1], gap="large")
    with account_col:
        _render_account_panel()
        st.write("")
        if st.button("View a sample report", use_container_width=True):
            st.session_state["show_demo"] = True
            _track_once("demo_opened", "demo_opened", workflow="detailed", mode="general")
            st.rerun()
        st.markdown(
            '<div class="vl-small" style="text-align:center">See a finished report first. '
            "No account needed.</div>",
            unsafe_allow_html=True,
        )

    with compose_col, st.container(key="vl_compose"):
        source_path, upload_path = _render_composer()

    mode = st.session_state.get("mode", "general")
    access = _access_mode()
    max_frames = 120 if mode in ("recipe", "tutorial") else st.session_state.get("max_frames", 20)
    if access == "account":
        max_frames = min(max_frames, MANAGED_MAX_FRAMES)
    frame_interval = (
        0.5 if mode in ("recipe", "tutorial") else st.session_state.get("frame_interval", 5.0)
    )
    force = st.session_state.get("force", False)
    prompt = st.session_state.get("prompt_input", preset_for_mode(mode).prompt)

    if st.session_state.pop("run_requested", False):
        _start_report(source_path, upload_path, prompt, mode, max_frames, frame_interval, force, access)

    if "result" in st.session_state:
        st.divider()
        render_results(st.session_state["result"])

    _render_footer()


def _render_composer() -> tuple[str | None, Path | None]:
    _step(1, "Choose your report")
    _render_workflow_picker()

    _step(2, "Add your video", "Paste a YouTube link or upload a file from your device.")
    url_tab, source_tab = st.tabs(["Paste a YouTube link", "Upload a video file"])

    source_path: str | None = None
    upload_path: Path | None = None

    with url_tab:
        url = st.text_input(
            "YouTube URL",
            placeholder="https://www.youtube.com/watch?v=...",
            label_visibility="collapsed",
        )
        if url.strip() and source_path is None:
            source_path = url.strip()
            _track_once("source_url", "source_added", source_kind="url")

    with source_tab:
        uploaded = st.file_uploader(
            "Drop a video file",
            type=["mp4", "mov", "webm", "mkv", "m4v"],
            accept_multiple_files=False,
            label_visibility="collapsed",
        )
        if uploaded is not None:
            upload_path = _save_upload(uploaded)
            source_path = str(upload_path)
            _track_once("source_upload", "source_added", source_kind="upload")
            st.caption(
                f"{uploaded.name} · {uploaded.size / 1024 / 1024:.1f} MB · ready for this session"
            )

    mode = st.session_state.get("mode", "general")
    if mode == "recipe":
        st.caption("Recipes use evidence from the video only; missing quantities stay marked unknown.")

    if "prompt_input" not in st.session_state:
        st.session_state["prompt_input"] = preset_for_mode(mode).prompt

    with st.expander("Customize what the report focuses on (optional)"):
        st.text_area(
            "What do you want to know about this video?",
            height=110,
            key="prompt_input",
        )
        if _access_mode() == "byok":
            _render_enhance_prompt(mode)
        _render_advanced_settings(mode)

    _step(3, "Create your report")
    run_col, note_col = st.columns([1.1, 1.4])
    if run_col.button("Create report", type="primary", use_container_width=True):
        st.session_state["run_requested"] = True
    note_col.markdown(_run_note(mode), unsafe_allow_html=True)
    return source_path, upload_path


def _run_note(mode: str) -> str:
    if _access_mode() == "byok":
        max_frames = 120 if mode in ("recipe", "tutorial") else st.session_state.get("max_frames", 20)
        low, high = _estimate_cost(max_frames)
        return (
            f'<div class="vl-small" style="padding-top:10px">Estimated OpenAI cost '
            f'<strong style="color:{BRAND_COLOR}">~${low:.2f}–${high:.2f}</strong> for a 3-minute video.</div>'
        )
    if _connection() is None:
        return '<div class="vl-small" style="padding-top:10px">Connect your free account to start.</div>'
    return (
        '<div class="vl-small" style="padding-top:10px">Uses 1 report from your allowance. '
        "Most videos finish in 1–4 minutes.</div>"
    )


def _render_enhance_prompt(mode: str) -> None:
    if not st.button("✨ Sharpen this prompt", help="Rewrites your prompt for this report type. Costs less than a cent."):
        return
    api_key = st.session_state.get("api_key", "")
    prompt = st.session_state.get("prompt_input", "")
    if not api_key:
        st.warning("Add your OpenAI API key first.")
        return
    if not prompt.strip():
        st.warning("Type a prompt first.")
        return
    with st.spinner("Sharpening prompt…"):
        from openai import OpenAI as _OpenAI
        from videolens.analysis import enhance_prompt as _enhance_prompt
        from videolens.analysis.enhance_prompt import EnhancePromptError as _EnhancePromptError

        try:
            new_prompt = _enhance_prompt(prompt, AnalysisMode(mode), _OpenAI(api_key=api_key), Models())
            st.session_state["prompt_input"] = new_prompt
            st.rerun()
        except _EnhancePromptError as exc:
            st.error(f"Could not sharpen the prompt: {exc}")


def _render_advanced_settings(mode: str) -> None:
    st.selectbox(
        "Report style",
        options=[m.value for m in AnalysisMode],
        format_func=lambda value: preset_for_mode(value).short_label,
        key="mode_selector",
        on_change=_on_mode_change,
    )
    st.caption(_mode_description(mode))
    if mode in ("recipe", "tutorial"):
        st.caption("Recipe and Procedure sample evidence frames automatically.")
        return
    left, right = st.columns(2)
    frame_cap = MANAGED_MAX_FRAMES if _access_mode() == "account" else 80
    st.session_state["max_frames"] = left.slider(
        "Max frames",
        min_value=3,
        max_value=frame_cap,
        value=min(st.session_state.get("max_frames", 20), frame_cap),
        step=1,
        help="Frames sent to the vision model. Higher means better visual coverage.",
    )
    st.session_state["frame_interval"] = right.slider(
        "Frame interval (s)",
        min_value=1.0,
        max_value=30.0,
        value=st.session_state.get("frame_interval", 5.0),
        step=0.5,
        help="Seconds between sampled frames. Grows automatically to respect max frames.",
    )


def _render_header() -> None:
    st.markdown(
        f"""
        <nav class="vl-nav">
          <a class="vl-brand" href="{_site_link('/', 'web_app_nav')}" target="_blank">
            <img src="{_logo_data_url()}" alt=""><span>VideoLens</span>
          </a>
          <div class="vl-links">
            <a href="{_site_link('/', 'web_app_nav')}#pricing" target="_blank">Pricing</a>
            <a href="{_site_link('/chrome', 'web_app_nav')}" target="_blank">Browser extension</a>
            <a class="vl-cta" href="{_site_link('/account', 'web_app_nav')}" target="_blank">My account</a>
          </div>
        </nav>
        <div class="vl-hero">
          <h1>Turn any video into a <em>written report</em>.</h1>
          <p>Get the key ideas, visual details, and practical steps from a YouTube video or your own
          recording, with timestamped evidence you can check.</p>
          <div class="vl-chips">
            <span class="vl-chip">3 free reports with your account</span>
            <span class="vl-chip">No API key or install</span>
            <span class="vl-chip">Works on phone and desktop</span>
            <span class="vl-chip">HTML, PDF and Markdown exports</span>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_footer() -> None:
    st.markdown(
        f"""
        <div class="vl-footer">
          <span>Videos and reports are processed for this session and are not stored. Usage
          analytics never include videos, links, prompts, or report text.</span>
          <span><a href="{_site_link('/privacy', 'web_app_footer')}" target="_blank">Privacy</a> ·
          <a href="{_site_link('/terms', 'web_app_footer')}" target="_blank">Terms</a> ·
          <a href="{_site_link('/support', 'web_app_footer')}" target="_blank">Support</a></span>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_workflow_picker() -> None:
    if "workflow" not in st.session_state:
        st.session_state["workflow"] = "detailed"
    if "mode" not in st.session_state:
        st.session_state["mode"] = "general"
    if "mode_selector" not in st.session_state:
        st.session_state["mode_selector"] = st.session_state["mode"]
    if "workflow_choice" not in st.session_state:
        st.session_state["workflow_choice"] = "detailed"

    selected = st.segmented_control(
        "Popular workflows",
        options=list(PRIMARY_WORKFLOWS),
        format_func=lambda value: WORKFLOW_PRESETS[value].short_label,
        selection_mode="single",
        key="workflow_choice",
        label_visibility="collapsed",
    )
    if selected and selected != st.session_state.get("workflow"):
        preset = preset_for(selected)
        st.session_state["workflow"] = selected
        st.session_state["mode"] = preset.mode.value
        st.session_state["mode_selector"] = preset.mode.value
        st.session_state["prompt_input"] = preset.prompt
        _track_event("workflow_selected", workflow=selected, mode=preset.mode.value)

    active = preset_for(st.session_state.get("workflow"))
    st.markdown(
        f'<div class="vl-hint" style="margin:6px 0 18px">{html.escape(active.description)}</div>',
        unsafe_allow_html=True,
    )


def _render_demo_report() -> None:
    _track_once("demo_opened", "demo_opened", workflow="detailed", mode="general")
    analysis = build_demo_analysis()
    report_markdown = render_report_markdown(analysis)
    report_html = render_html(analysis)
    try:
        report_pdf = render_pdf(analysis)
    except Exception:
        report_pdf = None

    st.success("Illustrative YouTube report — no API key or video required.")
    title_col, action_col = st.columns([3, 1])
    with title_col:
        st.markdown("## Sample: Why most note-taking systems fail")
        st.caption(
            "This precomputed example shows the written report VideoLens produces from an educational YouTube video."
        )
    with action_col:
        if st.button("Analyze a YouTube video", type="primary", use_container_width=True):
            st.session_state["show_demo"] = False
            st.rerun()

    metrics = st.columns(4)
    metrics[0].metric("Report style", "Detailed")
    metrics[1].metric("Video", "14:32")
    metrics[2].metric("Evidence points", "6")
    metrics[3].metric("Confidence", "High")

    report_tab, professional_tab, markdown_tab = st.tabs(
        ["**Written report**", "Professional report", "Markdown export"]
    )
    with report_tab:
        st.markdown("### Executive summary")
        st.write(analysis.summary)

        findings_col, actions_col = st.columns([1.2, 1])
        with findings_col:
            st.markdown("### Key findings")
            for index, finding in enumerate(analysis.findings, 1):
                with st.expander(f"{index}. {finding.finding}", expanded=True):
                    st.caption(f"{finding.confidence.upper()} CONFIDENCE")
                    for evidence in finding.evidence:
                        st.markdown(f"**⏱ {_fmt_ts(evidence.timestamp)}** — {evidence.detail}")

        with actions_col:
            st.markdown("### Practical takeaways")
            for recommendation in analysis.recommendations:
                st.markdown(f"**{recommendation.recommendation}**")
                if recommendation.rationale:
                    st.caption(recommendation.rationale)

            st.markdown("### Try the method")
            for task in analysis.tasks:
                detail = f" — {task.detail}" if task.detail else ""
                st.markdown(f"- [ ] **{task.title}**{detail}")

        st.warning(analysis.limitations[0])

    with professional_tab:
        st.caption("The standalone HTML report and PDF share the same print-ready visual design.")
        st.iframe(_report_preview_url(report_html), height=900)

    with markdown_tab:
        st.caption("Save this in your notes, research folder, or knowledge base.")
        st.code(report_markdown, language="markdown")

    html_col, pdf_col, markdown_col, continue_col = st.columns(4)
    if html_col.download_button(
        "Download HTML",
        data=report_html,
        file_name="videolens-sample-report.html",
        mime="text/html",
        use_container_width=True,
    ):
        _track_event("report_exported", workflow="detailed", mode="general", format="html")
    if report_pdf:
        if pdf_col.download_button(
            "Download PDF",
            data=report_pdf,
            file_name="videolens-sample-report.pdf",
            mime="application/pdf",
            use_container_width=True,
        ):
            _track_event("report_exported", workflow="detailed", mode="general", format="pdf")
    else:
        pdf_col.button("PDF unavailable", disabled=True, use_container_width=True)
    if markdown_col.download_button(
        "Download Markdown",
        data=report_markdown,
        file_name="videolens-sample-report.md",
        mime="text/markdown",
        use_container_width=True,
    ):
        _track_event("report_exported", workflow="detailed", mode="general", format="markdown")
    if continue_col.button("Create my report", use_container_width=True):
        st.session_state["show_demo"] = False
        st.session_state["workflow"] = "detailed"
        st.session_state["workflow_choice"] = "detailed"
        st.session_state["mode"] = "general"
        st.session_state["mode_selector"] = "general"
        st.session_state["prompt_input"] = WORKFLOW_PRESETS["detailed"].prompt
        st.rerun()


# ───────────────────────── pipeline runner ─────────────────────────


def _start_report(
    source_path: str | None,
    upload_path: Path | None,
    prompt: str,
    mode: str,
    max_frames: int,
    frame_interval: float,
    force: bool,
    access: str,
) -> None:
    if source_path is None:
        _track_event("validation_failed", mode=mode, error_code="missing_source")
        st.error("Paste a YouTube link or upload a video file first.")
        return
    if access == "byok" and not st.session_state.get("api_key"):
        _track_event("validation_failed", mode=mode, error_code="missing_api_key")
        st.error("Add your OpenAI API key in the panel on the right, then try again.")
        return
    if access == "account":
        if _connection() is None:
            _track_event("validation_failed", mode=mode, error_code="not_connected")
            st.error("Connect your free VideoLens account first. It takes about 30 seconds.")
            return
        if _remaining_reports(_account()) <= 0:
            _track_event("validation_failed", mode=mode, error_code="allowance_used")
            st.error("You have used your available reports. See the Pro options in the panel on the right.")
            return

    st.session_state.pop("result", None)
    st.session_state["qa_history"] = []
    st.session_state["seek_to"] = 0
    _track_event(
        "analysis_started",
        workflow=st.session_state.get("workflow", mode),
        mode=mode,
        source_kind="upload" if upload_path is not None else "url",
        access=access,
    )
    _run_pipeline(source_path, prompt, mode, max_frames, frame_interval, force, access)


def _source_type(source_path: str) -> str:
    """Label a failed source with the same vocabulary successful reports use."""
    try:
        return resolve_source(source_path).source_type.value
    except Exception:
        return "video"


def _failure_category(exc: Exception) -> tuple[str, str]:
    """Map a failure to the account's privacy-safe diagnostic stage and code."""
    if isinstance(exc, ManagedError):
        if exc.code == "network":
            return "analysis", "network"
        if exc.status == 429:
            return "analysis", "rate_limit"
        if exc.status in (401, 403):
            return "analysis", "authentication"
        return "analysis", "analysis"
    name = type(exc).__name__.lower()
    if "download" in name or "resolve" in name or "source" in name:
        return "source", "source"
    if "transcri" in name:
        return "transcription", "analysis"
    if "frame" in name:
        return "frames", "analysis"
    return "analysis", "analysis"


def _run_pipeline(
    source_path: str,
    prompt: str,
    mode: str,
    max_frames: int,
    frame_interval: float,
    force: bool,
    access: str,
) -> None:
    started_at = monotonic()
    connection = _connection() if access == "account" else None
    config = Config(
        models=MANAGED_MODELS if connection else Models(),
        defaults=MANAGED_DEFAULTS if connection else Defaults(),
        cache_root=_session_directory() / "cache",
        openai_api_key=None if connection else st.session_state.get("api_key"),
    )

    report_id: str | None = None
    client = None
    if connection is not None:
        try:
            report_id = reserve_report(connection)
        except ManagedError as exc:
            st.error(str(exc))
            st.session_state["account"] = None
            _track_event("analysis_failed", mode=mode, error_code=exc.code, access=access)
            return
        client = ManagedClient(connection, report_id)
        st.session_state["report_id"] = report_id

    state: list[str] = ["pending"] * len(STEP_KEYS)
    container = st.container()
    container.markdown(
        '<div class="vl-small">Keep this tab open while your report is created.</div>',
        unsafe_allow_html=True,
    )
    stepper_slot = container.empty()
    log_expander = container.expander("Detailed log", expanded=False)
    captured: list[str] = []

    stepper_slot.markdown(_render_stepper(state), unsafe_allow_html=True)

    class UIConsole:
        def print(self, *args, **kwargs):
            msg = " ".join(str(a) for a in args)
            cleaned = _strip_rich_tags(msg)
            captured.append(cleaned)
            log_expander.write(cleaned)

            idx = _step_index_from_message(cleaned)
            if idx is not None:
                for i in range(idx):
                    if state[i] != "complete":
                        state[i] = "complete"
                if state[idx] != "complete":
                    state[idx] = "running"
                stepper_slot.markdown(_render_stepper(state), unsafe_allow_html=True)

        def print_exception(self):
            import traceback

            tb = traceback.format_exc()
            captured.append(tb)
            log_expander.code(tb)

    try:
        result = run_extraction(
            source_path,
            mode=AnalysisMode(mode),
            config=config,
            frame_interval=float(frame_interval),
            max_frames=int(max_frames),
            force=force,
            console=UIConsole(),  # type: ignore[arg-type]
            prompt=prompt,
            output_dir=None,
            client=client,
        )
    except Exception as exc:
        for i in range(len(state)):
            if state[i] == "running":
                state[i] = "pending"
        stepper_slot.markdown(_render_stepper(state), unsafe_allow_html=True)
        if connection is not None and report_id is not None:
            stage, code = _failure_category(exc)
            try:
                complete_report(
                    connection,
                    report_id,
                    failed=True,
                    title="Untitled video",
                    source_type=_source_type(source_path),
                    mode=mode,
                    failure_stage=stage,
                    failure_code=code,
                )
            except ManagedError:
                pass
            st.session_state["account"] = None
            st.error(f"This report could not be created: {exc}")
            st.info("Your report allowance was not used. You can try again or choose another video.")
        else:
            st.error(f"This report could not be created: {exc}")
        with st.expander("Technical details"):
            st.code("\n".join(captured))
        _track_event(
            "analysis_failed",
            workflow=st.session_state.get("workflow", mode),
            mode=mode,
            error_code=type(exc).__name__,
            access=access,
            latency_bucket=latency_bucket((monotonic() - started_at) * 1000),
        )
        return

    if connection is not None and report_id is not None:
        try:
            complete_report(
                connection,
                report_id,
                failed=False,
                title=(result.resolved.title or result.video_path.stem or "Untitled video"),
                source_type=result.resolved.source_type.value,
                mode=mode,
            )
        except ManagedError:
            pass
        st.session_state["account"] = None

    state = ["complete"] * len(STEP_KEYS)
    stepper_slot.markdown(_render_stepper(state), unsafe_allow_html=True)
    st.session_state["result"] = result
    st.session_state["pdf_bytes"] = None
    if result.analysis is not None:
        try:
            st.session_state["pdf_bytes"] = render_pdf(result.analysis)
        except Exception as exc:
            st.session_state["pdf_error"] = str(exc)

    _track_event(
        "analysis_succeeded",
        workflow=st.session_state.get("workflow", mode),
        mode=mode,
        access=access,
        source_kind=result.resolved.source_type.value,
        duration_bucket=duration_bucket(result.metadata.duration_seconds),
        latency_bucket=latency_bucket((monotonic() - started_at) * 1000),
        finding_count_bucket=count_bucket(len(result.analysis.findings) if result.analysis else 0),
    )
    # Refresh the account panel so the allowance meter reflects this report.
    st.rerun()


# ───────────────────────── results ─────────────────────────


def render_results(result: ExtractionResult) -> None:
    md = result.metadata
    cols = st.columns(5)
    platform = result.resolved.platform or result.resolved.source_type.value
    cols[0].metric("Source", platform)
    cols[1].metric("Duration", f"{md.duration_seconds:.1f}s" if md.duration_seconds else "?")
    cols[2].metric("Resolution", f"{md.width}×{md.height}" if md.width else "?")
    cols[3].metric("Frames analyzed", len(result.frame_summaries))
    cols[4].metric("Timeline segments", len(result.timeline.segments))

    if result.resolved.limitations:
        st.warning(
            "Limitations:\n"
            + "\n".join(f"- {limitation}" for limitation in result.resolved.limitations)
        )

    tab_report, tab_timeline, tab_frames, tab_transcript, tab_raw = st.tabs(
        ["**Report**", "Timeline", "Frames", "Transcript", "Cache"]
    )

    with tab_report:
        render_report_tab(result)
    with tab_timeline:
        render_timeline_tab(result)
    with tab_frames:
        render_frames_tab(result)
    with tab_transcript:
        render_transcript_tab(result)
    with tab_raw:
        render_cache_tab(result)


def render_report_tab(result: ExtractionResult) -> None:
    analysis = result.analysis
    if analysis is None:
        st.info("No analysis produced — provide a prompt and re-run.")
        return

    player_col, report_col = st.columns([1, 1.3])

    with player_col:
        st.markdown("**Player**")
        video_path = result.video_path
        if video_path.exists():
            st.video(str(video_path), start_time=int(st.session_state.get("seek_to", 0)))
            if st.session_state.get("seek_to", 0) > 0:
                if st.button("⏮ Reset to start", use_container_width=True):
                    st.session_state["seek_to"] = 0
                    st.rerun()
        else:
            st.info("Video file no longer available for playback.")

    with report_col:
        conf_color = {"high": "#10B981", "medium": "#F59E0B", "low": "#EF4444"}.get(
            analysis.confidence, "#94A3B8"
        )
        st.markdown(
            f"""
            <div style="display:flex;align-items:center;justify-content:space-between;
                        padding:14px 16px;background:#F8FAFC;border-radius:10px;
                        border-left:4px solid {conf_color};margin-bottom:12px">
              <div style="font-weight:700;color:#0F172A;font-size:15px">Executive Summary</div>
              <div style="font-size:12px;color:{conf_color};font-weight:700;text-transform:uppercase">
                {analysis.confidence} confidence
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.write(analysis.summary or "_(no summary)_")

    st.divider()
    if analysis.recipe or analysis.procedure:
        st.markdown(structured_markdown(analysis))
        report = analysis.procedure or analysis.recipe
        timestamps = sorted(
            {t for _, rows in report_sections(analysis) for _, f in rows for t in f["timestamps"]}
        )
        with st.expander("Jump to source evidence"):
            for timestamp in timestamps:
                if st.button(f"Play {_fmt_ts(timestamp)}", key=f"structured_seek_{timestamp}"):
                    st.session_state["seek_to"] = timestamp
                    st.rerun()
        st.subheader("Your checklist")
        st.caption(
            "Checkmarks stay in this session. Download the report to keep the steps and evidence."
        )
        report_id = hashlib.sha256(analysis.model_dump_json().encode()).hexdigest()[:12]
        for index, step in enumerate(report["steps"]):
            action = step.get("action") or step.get("instruction")
            st.checkbox(f"Step {index + 1}: {fact_text(action)}", key=f"check_{report_id}_{index}")
        st.download_button(
            "Download checklist",
            structured_markdown(analysis),
            file_name="videolens-checklist.md",
            mime="text/markdown",
        )

    if not (analysis.recipe or analysis.procedure):
        cols = st.columns([1.2, 1])
        with cols[0]:
            st.subheader("Findings")
            if not analysis.findings:
                st.caption("_(none)_")
            for i, f in enumerate(analysis.findings, 1):
                conf_color = {"high": "#10B981", "medium": "#F59E0B", "low": "#EF4444"}.get(
                    f.confidence, "#94A3B8"
                )
                with st.expander(f"**{i}. {f.finding}**", expanded=(i <= 2)):
                    st.markdown(
                        f'<span style="font-size:11px;color:{conf_color};font-weight:700;'
                        f'text-transform:uppercase">{f.confidence} confidence</span>',
                        unsafe_allow_html=True,
                    )
                    if f.evidence:
                        st.markdown("**Evidence**")
                        for j, e in enumerate(f.evidence):
                            ev_cols = st.columns([1, 5])
                            with ev_cols[0]:
                                if st.button(
                                    f"⏱ {_fmt_ts(e.timestamp)}",
                                    key=f"seek_{i}_{j}_{e.timestamp}",
                                    use_container_width=True,
                                ):
                                    _track_event(
                                        "evidence_used",
                                        workflow=st.session_state.get(
                                            "workflow", analysis.mode.value
                                        ),
                                        mode=analysis.mode.value,
                                    )
                                    st.session_state["seek_to"] = e.timestamp
                                    st.rerun()
                            ev_cols[1].markdown(e.detail)
                    else:
                        st.caption("_(no evidence cited)_")

        with cols[1]:
            st.subheader("Recommendations")
            if not analysis.recommendations:
                st.caption("_(none)_")
            for r in analysis.recommendations:
                st.markdown(f"**{r.recommendation}**")
                if r.rationale:
                    st.caption(r.rationale)
                st.caption(f"Confidence: {r.confidence}")
                st.write("")

            st.subheader("Follow-up ideas")
            if not analysis.tasks:
                st.caption("_(none)_")
            for t in analysis.tasks:
                if t.detail:
                    st.markdown(f"- **{t.title}** — {t.detail}")
                else:
                    st.markdown(f"- {t.title}")

    if analysis.limitations:
        st.divider()
        st.subheader("Limitations")
        for lim in analysis.limitations:
            st.markdown(f"- {lim}")

    st.divider()
    st.subheader("Professional report")
    st.caption(
        "Open the standalone HTML report in any browser, share the print-ready PDF, or keep the raw "
        "Markdown and JSON. All formats preserve the report structure and evidence."
    )
    basename = _output_basename(result)
    st.caption(f"Downloads named after the source: `{basename}_*`")
    html_report = result.report_html or render_html(analysis)
    pdf_bytes = st.session_state.get("pdf_bytes")
    pdf_error = st.session_state.get("pdf_error")
    dl_cols = st.columns(4)
    if dl_cols[0].download_button(
        "🌐 Download HTML",
        data=html_report,
        file_name=f"{basename}_report.html",
        mime="text/html",
        use_container_width=True,
    ):
        _track_event("report_exported", mode=analysis.mode.value, format="html")
    if result.report_markdown:
        if pdf_bytes:
            if dl_cols[1].download_button(
                "📄 Download PDF",
                data=pdf_bytes,
                file_name=f"{basename}_report.pdf",
                mime="application/pdf",
                use_container_width=True,
            ):
                _track_event("report_exported", mode=analysis.mode.value, format="pdf")
        else:
            dl_cols[1].button("PDF unavailable", disabled=True, use_container_width=True)
            if pdf_error:
                dl_cols[1].caption(f"PDF error: {pdf_error}")
        if dl_cols[2].download_button(
            "📝 Download Markdown",
            data=result.report_markdown,
            file_name=f"{basename}_report.md",
            mime="text/markdown",
            use_container_width=True,
        ):
            _track_event("report_exported", mode=analysis.mode.value, format="markdown")
        if dl_cols[3].download_button(
            "🗂 Download JSON",
            data=analysis.model_dump_json(indent=2),
            file_name=f"{basename}_analysis.json",
            mime="application/json",
            use_container_width=True,
        ):
            _track_event("report_exported", mode=analysis.mode.value, format="json")

    with st.expander("Preview standalone HTML report", expanded=False):
        st.iframe(_report_preview_url(html_report), height=900)

    _render_qa_section(result)


def _render_qa_section(result: ExtractionResult) -> None:
    """Q&A loop: ask follow-up questions against the cached timeline + prior
    analysis. Each Q&A is one cheap synthesis call; the heavy extraction never
    re-runs."""
    st.divider()
    st.subheader("💬 Ask a follow-up question")
    st.caption(
        "Follow-ups are included with account reports. The video isn't re-processed, "
        "so answers arrive in seconds."
    )

    qa_history: list[dict[str, str]] = st.session_state.setdefault("qa_history", [])

    for entry in qa_history:
        with st.chat_message("user"):
            st.markdown(entry["question"])
        with st.chat_message("assistant"):
            st.markdown(entry["answer"])

    if "qa_input" not in st.session_state:
        st.session_state["qa_input"] = ""

    new_question = st.text_input(
        "Your question",
        value=st.session_state["qa_input"],
        key="qa_input_widget",
        placeholder="e.g. What specifically went wrong at the 1:20 mark?",
        label_visibility="collapsed",
    )

    api_key = st.session_state.get("api_key", "")
    connection = _connection() if _access_mode() == "account" else None
    report_id = st.session_state.get("report_id")

    if st.button("Ask", type="secondary"):
        if connection is None and not api_key:
            st.warning("Connect your VideoLens account or add your OpenAI API key before asking.")
        elif connection is not None and not report_id:
            st.warning("Follow-up questions are available for reports created with your account.")
        elif not new_question.strip():
            st.warning("Type a question first.")
        else:
            _track_event(
                "followup_started",
                workflow=st.session_state.get("workflow", result.analysis.mode.value),
                mode=result.analysis.mode.value,
            )
            with st.spinner("Thinking…"):
                from openai import OpenAI as _OpenAI
                from videolens.analysis import ask_question as _ask_question
                from videolens.analysis.ask_question import (
                    AskQuestionError as _AskQuestionError,
                )

                try:
                    client = (
                        ManagedClient(connection, report_id)
                        if connection is not None
                        else _OpenAI(api_key=api_key)
                    )
                    answer = _ask_question(
                        new_question,
                        result.timeline,
                        result.analysis,
                        client,
                        Models(),
                    )
                    qa_history.append({"question": new_question, "answer": answer})
                    st.session_state["qa_history"] = qa_history
                    st.session_state["qa_input"] = ""
                    _track_event(
                        "followup_succeeded",
                        workflow=st.session_state.get("workflow", result.analysis.mode.value),
                        mode=result.analysis.mode.value,
                    )
                    st.rerun()
                except (_AskQuestionError, ManagedError) as exc:
                    _track_event(
                        "followup_failed",
                        workflow=st.session_state.get("workflow", result.analysis.mode.value),
                        mode=result.analysis.mode.value,
                        error_code=type(exc).__name__,
                    )
                    st.error(f"Q&A failed: {exc}")

    if qa_history:
        if st.button("Clear conversation", type="secondary"):
            st.session_state["qa_history"] = []
            st.rerun()


def render_timeline_tab(result: ExtractionResult) -> None:
    if not result.timeline.segments:
        st.info("No timeline segments — extraction returned no frames or transcript.")
        return
    df = pd.DataFrame(
        [
            {
                "start": _fmt_ts(s.start),
                "end": _fmt_ts(s.end),
                "scene": s.scene_type or "",
                "visual": s.visual_summary or "",
                "ocr": ", ".join(s.ocr) if s.ocr else "",
                "transcript": s.transcript or "",
                "conf": s.confidence,
            }
            for s in result.timeline.segments
        ]
    )
    st.dataframe(df, use_container_width=True, hide_index=True)


def render_frames_tab(result: ExtractionResult) -> None:
    if not result.frame_summaries:
        st.info("No frames described.")
        return
    for i in range(0, len(result.frame_summaries), 3):
        cols = st.columns(3)
        for j, summary in enumerate(result.frame_summaries[i : i + 3]):
            with cols[j]:
                frame = result.frames[i + j] if i + j < len(result.frames) else None
                if frame and frame.path.exists():
                    st.image(str(frame.path), use_container_width=True)
                st.caption(f"**t={_fmt_ts(summary.timestamp)}** · {summary.confidence}")
                st.write(summary.visual_summary or "_(no description)_")
                if summary.detected_context:
                    st.caption("tags: " + ", ".join(summary.detected_context))
                if summary.extracted_text:
                    with st.expander("OCR"):
                        st.write("\n".join(f"- {t}" for t in summary.extracted_text))


def render_transcript_tab(result: ExtractionResult) -> None:
    if result.transcript is None or not result.transcript.segments:
        st.info("No transcript (no audio, or transcription failed).")
        return
    st.caption(f"Language: {result.transcript.language or 'unknown'}")
    df = pd.DataFrame(
        [
            {
                "start": _fmt_ts(s.start),
                "end": _fmt_ts(s.end),
                "speaker": s.speaker or "",
                "text": s.text,
            }
            for s in result.transcript.segments
        ]
    )
    st.dataframe(df, use_container_width=True, hide_index=True)


def render_cache_tab(result: ExtractionResult) -> None:
    st.caption(f"Cache directory: `{result.cache.dir}`")
    for f in sorted(result.cache.dir.glob("*.json")):
        with st.expander(f.name):
            st.code(f.read_text(), language="json")


if __name__ == "__main__":
    main()
