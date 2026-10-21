"""Audio-grounded music highlights; no popularity or replay analytics."""
from __future__ import annotations

import asyncio
import logging
import math
import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from app.ai.gemini_client import extract_timed_audio_samples
from app.ai.gemini_transport import generate_json
from app.video.probe import probe_video

logger = logging.getLogger(__name__)
MAX_AUDIO_SECONDS = 900


class HighlightError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class MusicHighlight(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)
    label: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=1, max_length=700)

    @field_validator("label", "reason")
    @classmethod
    def meaningful_text(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("Explain the audible musical event.")
        if re.search(r"\b(?:most[ -](?:listened|replayed|played|popular)|viral|trending|popularity|replay counts?|listen counts?|audience analytics)\b", value, re.IGNORECASE):
            raise ValueError("Listening statistics are unavailable; describe audible music only.")
        return value

    @model_validator(mode="after")
    def ordered(self):
        if self.end <= self.start:
            raise ValueError("Highlight end must follow start.")
        return self


class HighlightPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    highlights: list[MusicHighlight] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def distinct_sections(self):
        for index, item in enumerate(self.highlights):
            for previous in self.highlights[:index]:
                if abs(item.start - previous.start) < 0.5 and abs(item.end - previous.end) < 0.5:
                    raise ValueError("Choose distinct musical sections, not repeated copies of one range.")
        return self


class MusicHighlightsResult(HighlightPayload):
    model_used: str = Field(min_length=1, max_length=100)
    basis: Literal["audio_analysis"] = "audio_analysis"


async def find_music_highlights(path: Path, clip_duration: float, api_key: str) -> dict:
    """Listen to the registered track and validate every returned source timestamp."""
    if not api_key.strip():
        raise HighlightError("Add your Gemini API key in Settings to find music highlights.", 503)
    if not math.isfinite(clip_duration) or not 0 < clip_duration <= MAX_AUDIO_SECONDS:
        raise ValueError("Choose a positive highlight length up to 15 minutes.")
    try:
        info = await asyncio.to_thread(probe_video, str(path))
    except Exception as exc:
        logger.warning("Cannot inspect music highlight audio: %s", exc)
        raise HighlightError("Cannot inspect the saved music. Check FFmpeg/FFprobe or import the track again.", 400) from exc
    if not info.has_audio or not math.isfinite(info.duration) or info.duration <= 0:
        raise HighlightError("This saved track has no playable audio. Import it again.", 400)
    if info.duration > MAX_AUDIO_SECONDS:
        raise HighlightError("Find highlights supports music up to 15 minutes. Import a shorter version.", 400)
    target = min(clip_duration, info.duration)
    try:
        evidence = await extract_timed_audio_samples(str(path), info.duration, full_coverage=True)
    except Exception as exc:
        logger.warning("Cannot extract music highlight evidence: %s", exc)
        raise HighlightError("Cannot read the complete music audio. Check FFmpeg and import the track again.", 400) from exc
    if not any(part.get("inlineData", {}).get("data") for part in evidence):
        raise HighlightError("No readable audio was extracted. Check FFmpeg and import the track again.", 400)
    prompt = f"""Listen to the attached music evidence across the entire source timeline.
Choose 1 to 3 distinct strong sections for a video, ordered best first. The source lasts
{info.duration:.6f} seconds. Aim for {target:.6f} seconds per section; shorter ranges are
allowed for natural musical boundaries. Never exceed {target:.6f} seconds per section.
Use audible chorus entries, drops, builds, melodic hooks, or emotional peaks. Describe
the audible opening, payoff and ending in each concise reason. Avoid mid-word cuts.
All start/end timestamps are numeric seconds on the original source timeline, including
the source offsets supplied beside each audio passage. Require 0 <= start < end <=
{info.duration:.6f}. Do not use filename, artist knowledge, or duration patterns as evidence.
These are audio-based editorial suggestions. You have NO listening statistics, replay,
popularity, social trends or audience analytics. Never claim most-listened, most-replayed,
viral, trending, popular, or measured audience preference. Do not transcribe lyrics.
Return JSON with highlights: an array of {{start,end,label,reason}} only.
The musical selection instructions here take precedence over generic extraction captions.
"""
    schema = {"type": "OBJECT", "properties": {"highlights": {"type": "ARRAY", "minItems": 1,
              "maxItems": 3, "items": {"type": "OBJECT", "properties": {
                  "start": {"type": "NUMBER"}, "end": {"type": "NUMBER"},
                  "label": {"type": "STRING"}, "reason": {"type": "STRING"}},
                  "required": ["start", "end", "label", "reason"]}}}, "required": ["highlights"]}
    correction = ""
    for attempt in range(2):
        try:
            data, model = await generate_json(
                [*evidence, {"text": prompt + correction}], api_key.strip(), schema,
                temperature=0.2, max_output_tokens=2048,
            )
        except RuntimeError as exc:
            # The shared requester owns retries, model availability and quota handling.
            # Retrying a rejected key or exhausted quota here would waste another call.
            raise HighlightError(str(exc), getattr(exc, "status_code", 502)) from exc
        try:
            parsed = HighlightPayload.model_validate(data)
            for item in parsed.highlights:
                if item.end > info.duration or item.end - item.start > target + 0.001:
                    raise ValueError("Highlight is outside the source or requested clip length.")
            return MusicHighlightsResult(highlights=parsed.highlights, model_used=model).model_dump()
        except (ValueError, TypeError, ValidationError) as exc:
            logger.warning("Music highlights model %s returned invalid highlights (%s), attempt %s",
                           model, type(exc).__name__, attempt + 1)
            correction = (
                "\nThe previous response failed validation. Listen again and return only 1 to 3 "
                "distinct sections with numeric, finite timestamps within the source duration "
                f"and no longer than {target:.6f} seconds each. Use non-empty labels and reasons "
                "describing only audible music. Do not mention popularity or listening statistics."
            )
    raise HighlightError("Gemini returned invalid or out-of-range music highlights after retrying. Try AI Highlights again.")
