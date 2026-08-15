from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    LOCAL_FILE = "local_file"
    DIRECT_URL = "direct_url"
    YOUTUBE = "youtube"
    WEBPAGE = "webpage"
    REPLAY_JSON = "replay_json"
    BROWSER_CAPTURE = "browser_capture"
    UNKNOWN = "unknown"


class AccessLevel(str, Enum):
    FULL_VIDEO = "full_video"
    TRANSCRIPT_ONLY = "transcript_only"
    SCREENSHOTS_ONLY = "screenshots_only"
    REPLAY_EVENTS = "replay_events"
    BLOCKED = "blocked"


class AnalysisMode(str, Enum):
    GENERAL = "general"
    BUG = "bug"
    MEETING = "meeting"
    UX = "ux"
    TUTORIAL = "tutorial"
    PRODUCT_DEMO = "product_demo"
    CONTENT = "content"
    PRIVACY = "privacy"
    PRODUCTION_RECIPE = "production_recipe"


Confidence = Literal["high", "medium", "low"]


class ArtifactsAvailable(BaseModel):
    video: bool = False
    audio: bool = False
    transcript: bool = False
    frames: bool = False
    ocr: bool = False
    events: bool = False
    metadata: bool = False


class ResolvedSource(BaseModel):
    source_url: str
    source_type: SourceType
    access_level: AccessLevel
    artifacts_available: ArtifactsAvailable
    limitations: list[str] = Field(default_factory=list)
    local_path: Path | None = None
    title: str | None = None
    author: str | None = None
    duration_seconds: float | None = None
    platform: str | None = None


class Metadata(BaseModel):
    duration_seconds: float | None = None
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    has_audio: bool = False
    codec: str | None = None
    container: str | None = None
    title: str | None = None
    description: str | None = None
    upload_date: str | None = None
    author: str | None = None
    platform: str | None = None


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str
    speaker: str | None = None


class Transcript(BaseModel):
    language: str | None = None
    segments: list[TranscriptSegment] = Field(default_factory=list)


class Frame(BaseModel):
    timestamp: float
    path: Path
    reason: Literal["scene_change", "interval", "manual"] = "interval"


class OcrResult(BaseModel):
    timestamp: float
    text: list[str] = Field(default_factory=list)
    confidence: float | None = None


class FrameSummary(BaseModel):
    timestamp: float
    visual_summary: str
    detected_context: list[str] = Field(default_factory=list)
    extracted_text: list[str] = Field(default_factory=list)
    confidence: Confidence = "medium"


class TimelineSegment(BaseModel):
    start: float
    end: float
    scene_type: str | None = None
    transcript: str | None = None
    ocr: list[str] = Field(default_factory=list)
    visual_summary: str | None = None
    detected_actions: list[str] = Field(default_factory=list)
    interpretation: str | None = None
    confidence: Confidence = "medium"


class Timeline(BaseModel):
    segments: list[TimelineSegment] = Field(default_factory=list)


class Evidence(BaseModel):
    timestamp: float
    detail: str


class Finding(BaseModel):
    finding: str
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: Confidence = "medium"


class Recommendation(BaseModel):
    recommendation: str
    rationale: str | None = None
    confidence: Confidence = "medium"


class Task(BaseModel):
    title: str
    detail: str | None = None


class Analysis(BaseModel):
    source: ResolvedSource
    mode: AnalysisMode
    prompt: str
    summary: str
    timeline: Timeline
    findings: list[Finding] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    confidence: Confidence = "medium"
