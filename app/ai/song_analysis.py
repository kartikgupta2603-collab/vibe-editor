"""Select complete musical moments from the supplied audio, without style advice."""
from __future__ import annotations

import asyncio
import math

from app.ai.gemini_transport import GeminiError, generate_json
from app.video.probe import probe_video

MOMENT_PROPERTIES = {
    "start": {"type": "NUMBER"}, "end": {"type": "NUMBER"},
    "clip_type": {"type": "STRING"}, "reason": {"type": "STRING"},
    "start_anchor": {"type": "STRING"}, "payoff_time": {"type": "NUMBER"},
    "payoff_anchor": {"type": "STRING"}, "end_anchor": {"type": "STRING"}}
SCHEMA = {"type": "OBJECT", "properties": {
    "moments": {"type": "ARRAY", "minItems": 1, "maxItems": 3,
                "items": {"type": "OBJECT", "properties": MOMENT_PROPERTIES,
                          "required": list(MOMENT_PROPERTIES)}}}, "required": ["moments"]}


def validate_moments(data, duration):
    if not isinstance(data, dict) or not isinstance(data.get("moments"), list) or not 1 <= len(data["moments"]) <= 3:
        raise ValueError("Gemini did not return a complete musical moment.")
    moments = []
    for item in data["moments"]:
        if not isinstance(item, dict):
            raise ValueError("Gemini returned an unreadable musical moment.")
        numbers = [item.get(key) for key in ("start", "end", "payoff_time")]
        if not all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) for n in numbers):
            raise ValueError("Gemini returned invalid moment timestamps.")
        start, end, payoff = numbers
        if not 0 <= start < payoff < end <= duration:
            raise ValueError("Gemini returned a musical moment outside the source timeline.")
        for key in ("clip_type", "reason", "start_anchor", "payoff_anchor", "end_anchor"):
            if not isinstance(item.get(key), str) or not item[key].strip():
                raise ValueError("Gemini did not explain the audible events in this moment.")
        if any(abs(start - m["start"]) < .25 and abs(end - m["end"]) < .25 for m in moments):
            continue
        moments.append({**{key: item[key].strip() for key in ("clip_type", "reason", "start_anchor", "payoff_anchor", "end_anchor")},
                        "start": round(start, 3), "end": round(end, 3), "payoff_time": round(payoff, 3),
                        "duration": round(end - start, 3), "score": None})
    return moments


async def analyze_song(song_name="", anime_name="", duration=90.0, video_title="", api_key_override=None, video_path=""):
    from app.config.settings import get_settings
    from app.ai.gemini_client import extract_timed_audio_samples
    key = (api_key_override or get_settings().gemini_api_key or "").strip()
    if not key:
        raise GeminiError("Add your Gemini API key in Settings before analyzing the song.", 503)
    try:
        info = await asyncio.to_thread(probe_video, video_path)
    except Exception as exc:
        raise ValueError("Could not read the source audio. Reload the video and check FFmpeg.") from exc
    duration = info.duration
    if not getattr(info, "has_audio", False) or not math.isfinite(duration) or not 0 < duration <= 900:
        raise ValueError("Analyze Song needs readable audio up to 15 minutes long.")
    evidence = await extract_timed_audio_samples(video_path, duration, full_coverage=True)
    if not any(part.get("inlineData", {}).get("data") for part in evidence):
        raise ValueError("No readable audio was extracted. Reload the source and check FFmpeg.")
    prompt = f"""Listen to all supplied audio evidence on the original {duration:.3f}-second source timeline.
Choose one best complete musical section and up to two distinct alternatives, ordered best first.
Use actual audible transitions, phrase boundaries, chorus entries, drops, or emotional peaks.
Keep complete satisfying sections; do not force a fixed duration or cut through a word or held note.
For each moment give source start/end and an interior payoff_time, with specific audible
start_anchor, payoff_anchor, end_anchor descriptions, a short clip_type and an honest reason.
Require 0 <= start < payoff_time < end <= {duration:.3f}. Evidence offsets are source timestamps.
Do not invent listening statistics, claim audience popularity, identify song/anime from a filename,
generate subtitles, or recommend visual styles. Return only the requested moments JSON.
"""
    parts = [*evidence, {"text": prompt}]
    data, model = await generate_json(parts, key, SCHEMA, temperature=.2, max_output_tokens=4096)
    try:
        moments = validate_moments(data, duration)
    except ValueError as exc:
        data, model = await generate_json([*parts, {"text": f"Correct this validation problem: {exc} Use the supplied audio only."}],
                                          key, SCHEMA, temperature=.1, max_output_tokens=4096)
        moments = validate_moments(data, duration)
    best = moments[0]
    return {"status": "success", "basis": "audio_analysis", "song_name": (song_name or "").strip(),
            "anime_name": (anime_name or "").strip(), "recommended_start": best["start"],
            "recommended_end": best["end"], **{k: v for k, v in best.items() if k not in {"start", "end"}},
            "alternatives": moments[1:], "model_used": model}
